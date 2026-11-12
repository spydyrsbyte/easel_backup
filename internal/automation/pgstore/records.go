package pgstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"

	"easel/internal/automation"
	"easel/internal/database"
	"easel/internal/schema"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type Records struct {
	Pool   *pgxpool.Pool
	GameID string
	Schema *schema.Schema

	AuthorizeRecord func(context.Context, pgx.Tx, string, automation.Record) error
	IsDenied        func(error) bool
}

type postgresTransaction struct {
	store    *Records
	tx       pgx.Tx
	revision string
	loaded   map[string]*recordStorage
}
type recordStorage struct {
	owners    map[string]string
	fragments map[string]bson.M
	version   int64
}

func (store *Records) Begin(ctx context.Context) (automation.Transaction, error) {
	if store.Schema == nil {
		return nil, fmt.Errorf("record schema is not configured")
	}
	if store.AuthorizeRecord == nil {
		return nil, fmt.Errorf("record authorization is not configured")
	}
	tx, err := database.BeginSerializable(ctx, store.Pool)
	if err != nil {
		return nil, err
	}
	var revision *string
	err = tx.QueryRow(ctx, `SELECT active_revision_id::text FROM game_data.games WHERE game_id=$1 FOR SHARE`, store.GameID).Scan(&revision)
	if err != nil || revision == nil {
		_ = tx.Rollback(context.Background())
		if err != nil {
			return nil, fmt.Errorf("read active revision of game %s: %w", store.GameID, err)
		}
		return nil, fmt.Errorf("game has no active contract")
	}
	return &postgresTransaction{store: store, tx: tx, revision: *revision, loaded: map[string]*recordStorage{}}, nil
}

func (transaction *postgresTransaction) lookup(ctx context.Context) schema.Lookup {
	return func(id string) (string, error) { return recordType(ctx, transaction.tx, transaction.store.GameID, id) }
}

func (transaction *postgresTransaction) IDs(ctx context.Context, typeName string) ([]string, error) {
	if _, err := transaction.store.Schema.Type(typeName); err != nil {
		return nil, err
	}
	rows, err := transaction.tx.Query(ctx, `SELECT r.record_id::text,t.name FROM game_data.records r JOIN game_data.record_types t USING(game_id,record_type_id) WHERE r.game_id=$1 ORDER BY r.record_id`, transaction.store.GameID)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id, actual string
		if err := rows.Scan(&id, &actual); err != nil {
			rows.Close()
			return nil, err
		}
		if transaction.store.Schema.IsA(actual, typeName) {
			ids = append(ids, id)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	readable := []string{}
	for _, id := range ids {
		if _, err := transaction.Load(ctx, typeName, id); err != nil {
			if transaction.store.IsDenied != nil && transaction.store.IsDenied(err) {
				continue
			}
			return nil, err
		}
		readable = append(readable, id)
	}
	return readable, nil
}

func (transaction *postgresTransaction) Load(ctx context.Context, typeName, id string) (automation.Record, error) {
	record := automation.Record{ID: id, Data: map[string]any{}}
	storage := &recordStorage{owners: map[string]string{}, fragments: map[string]bson.M{}}
	err := transaction.tx.QueryRow(ctx, `SELECT r.record_version,t.name
 FROM game_data.records r JOIN game_data.record_types t USING(game_id,record_type_id)
 JOIN game_data.effective_schemas s ON s.game_id=r.game_id AND s.record_type_id=r.record_type_id AND s.revision_id=$3
 WHERE r.game_id=$1 AND r.record_id::text=$2 FOR UPDATE OF r`, transaction.store.GameID, id, transaction.revision).Scan(&record.Version, &record.Type)
	if errors.Is(err, pgx.ErrNoRows) {
		return automation.Record{}, fmt.Errorf("%s record %s does not exist: %w", typeName, id, err)
	}
	if err != nil {
		return automation.Record{}, fmt.Errorf("load record %s of type %s: %w", id, typeName, err)
	}
	if !transaction.store.Schema.IsA(record.Type, typeName) {
		return automation.Record{}, fmt.Errorf("record %s is a %s, not a %s", id, record.Type, typeName)
	}
	storage.version = record.Version
	if err := readFragments(ctx, transaction.tx, transaction.store.GameID, transaction.revision, id, storage, record.Data); err != nil {
		return automation.Record{}, err
	}
	if err := transaction.store.AuthorizeRecord(ctx, transaction.tx, "read", record); err != nil {
		return automation.Record{}, err
	}
	transaction.loaded[id] = storage
	return record, nil
}

func (transaction *postgresTransaction) contributor(ctx context.Context, recordType, field string) (string, error) {
	declared, err := transaction.store.Schema.Type(recordType)
	if err != nil {
		return "", err
	}
	fieldOwner := declared.Fields[field].Owner
	var owner string
	if err := transaction.tx.QueryRow(ctx, `SELECT c.contributor_id::text FROM game_data.contributors c JOIN game_data.revision_contributors r ON r.game_id=c.game_id AND r.contributor_id=c.contributor_id AND r.revision_id=$2 WHERE c.game_id=$1 AND c.name=$3`, transaction.store.GameID, transaction.revision, fieldOwner).Scan(&owner); err != nil {
		return "", fmt.Errorf("find contributor %s for field %s: %w", fieldOwner, field, err)
	}
	return owner, nil
}

func (transaction *postgresTransaction) writeFragments(ctx context.Context, record automation.Record, storage *recordStorage) error {
	fragments := map[string]bson.M{}
	for owner := range storage.fragments {
		fragments[owner] = bson.M{}
	}
	for field, value := range record.Data {
		owner := storage.owners[field]
		if owner == "" {
			var err error
			if owner, err = transaction.contributor(ctx, record.Type, field); err != nil {
				return err
			}
			storage.owners[field] = owner
		}
		if fragments[owner] == nil {
			fragments[owner] = bson.M{}
		}
		var original any
		if storage.fragments[owner] != nil {
			original = storage.fragments[owner][field]
		}
		converted, err := restoreBSON(value, original)
		if err != nil {
			return err
		}
		fragments[owner][field] = converted
	}
	for owner, fragment := range fragments {
		payload, err := bson.Marshal(fragment)
		if err != nil {
			return fmt.Errorf("encode fragment %s of record %s: %w", owner, record.ID, err)
		}
		_, err = transaction.tx.Exec(ctx, `INSERT INTO game_data.record_fragments(game_id,record_id,contributor_id,payload_bson) VALUES($1,$2,$3,$4)
 ON CONFLICT(game_id,record_id,contributor_id) DO UPDATE SET payload_bson=EXCLUDED.payload_bson,updated_at=now()`, transaction.store.GameID, record.ID, owner, payload)
		if err != nil {
			return fmt.Errorf("save fragment %s of record %s: %w", owner, record.ID, err)
		}
		storage.fragments[owner] = fragment
	}
	return nil
}

func (transaction *postgresTransaction) Save(ctx context.Context, record automation.Record) error {
	storage := transaction.loaded[record.ID]
	if storage == nil {
		return fmt.Errorf("record was not loaded in this transaction")
	}
	if err := transaction.store.AuthorizeRecord(ctx, transaction.tx, "modify", record); err != nil {
		return err
	}
	if err := transaction.store.Schema.ValidateWith(record.Type, record.Data, transaction.lookup(ctx)); err != nil {
		return err
	}
	if err := transaction.writeFragments(ctx, record, storage); err != nil {
		return err
	}
	command, err := transaction.tx.Exec(ctx, `UPDATE game_data.records SET record_version=record_version+1,updated_at=now(),last_validated_revision_id=$4 WHERE game_id=$1 AND record_id=$2 AND record_version=$3`, transaction.store.GameID, record.ID, storage.version, transaction.revision)
	if err != nil {
		return fmt.Errorf("update record %s: %w", record.ID, err)
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("record %s version conflict", record.ID)
	}
	storage.version++
	return nil
}

func (transaction *postgresTransaction) Create(ctx context.Context, record automation.Record) (automation.Record, error) {
	record.ID = ""
	if err := transaction.store.AuthorizeRecord(ctx, transaction.tx, "create", record); err != nil {
		return automation.Record{}, err
	}
	if err := transaction.store.Schema.ValidateWith(record.Type, record.Data, transaction.lookup(ctx)); err != nil {
		return automation.Record{}, err
	}
	err := transaction.tx.QueryRow(ctx, `INSERT INTO game_data.records(game_id,record_type_id,last_validated_revision_id)
 SELECT game_id,record_type_id,$3 FROM game_data.record_types WHERE game_id=$1 AND name=$2 RETURNING record_id::text,record_version`, transaction.store.GameID, record.Type, transaction.revision).Scan(&record.ID, &record.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return automation.Record{}, fmt.Errorf("record type %s is not published in the active revision", record.Type)
	}
	if err != nil {
		return automation.Record{}, fmt.Errorf("create %s record: %w", record.Type, err)
	}
	storage := &recordStorage{owners: map[string]string{}, fragments: map[string]bson.M{}, version: record.Version}
	if err := transaction.writeFragments(ctx, record, storage); err != nil {
		return automation.Record{}, err
	}
	transaction.loaded[record.ID] = storage
	return record, nil
}

func (transaction *postgresTransaction) Remove(ctx context.Context, record automation.Record) error {
	if transaction.loaded[record.ID] == nil {
		return fmt.Errorf("record was not loaded in this transaction")
	}
	if err := transaction.store.AuthorizeRecord(ctx, transaction.tx, "remove", record); err != nil {
		return err
	}
	if _, err := transaction.tx.Exec(ctx, `DELETE FROM game_data.records WHERE game_id=$1 AND record_id=$2`, transaction.store.GameID, record.ID); err != nil {
		return fmt.Errorf("remove record %s: %w", record.ID, err)
	}
	delete(transaction.loaded, record.ID)
	return nil
}

func (transaction *postgresTransaction) Commit(ctx context.Context) error {
	if err := transaction.tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit record transaction: %w", err)
	}
	return nil
}
func (transaction *postgresTransaction) Rollback(ctx context.Context) error {
	return transaction.tx.Rollback(ctx)
}

func normalizeBSON(value any) (any, error) {
	switch value := value.(type) {
	case nil, string, bool:
		return value, nil
	case int32:
		return json.Number(strconv.FormatInt(int64(value), 10)), nil
	case int64:
		return json.Number(strconv.FormatInt(value, 10)), nil
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return taggedBSON(value)
		}
		return json.Number(strconv.FormatFloat(value, 'g', -1, 64)), nil
	case bson.Decimal128:
		if !automation.ValidNumber(value.String()) {
			return taggedBSON(value)
		}
		return json.Number(value.String()), nil
	case bson.M:
		result := map[string]any{}
		for field, item := range value {
			converted, err := normalizeBSON(item)
			if err != nil {
				return nil, err
			}
			result[field] = converted
		}
		return result, nil
	case bson.D:
		result := map[string]any{}
		for _, element := range value {
			if _, found := result[element.Key]; found {
				return nil, fmt.Errorf("duplicate BSON field %q", element.Key)
			}
			converted, err := normalizeBSON(element.Value)
			if err != nil {
				return nil, err
			}
			result[element.Key] = converted
		}
		return result, nil
	case bson.A:
		result := make([]any, len(value))
		for index, item := range value {
			converted, err := normalizeBSON(item)
			if err != nil {
				return nil, err
			}
			result[index] = converted
		}
		return result, nil
	default:
		return taggedBSON(value)
	}
}

func taggedBSON(value any) (any, error) {
	encoded, err := bson.MarshalExtJSON(bson.M{"value": value}, true, false)
	if err != nil {
		return nil, err
	}
	var document map[string]any
	if err := json.Unmarshal(encoded, &document); err != nil {
		return nil, err
	}
	return map[string]any{"$bson": document["value"]}, nil
}

func restoreBSON(value, original any) (any, error) {
	if original != nil {
		normalized, err := normalizeBSON(original)
		if err != nil {
			return nil, err
		}
		if automation.Equal(value, normalized) {
			return original, nil
		}
	}
	switch value := value.(type) {
	case json.Number:
		if integer, err := value.Int64(); err == nil {
			return integer, nil
		}
		decimal, err := bson.ParseDecimal128(string(value))
		if err != nil {
			return nil, fmt.Errorf("number is outside BSON decimal precision: %w", err)
		}
		return decimal, nil
	case map[string]any:
		if tagged, found := value["$bson"]; found && len(value) == 1 {
			data, err := json.Marshal(map[string]any{"value": tagged})
			if err != nil {
				return nil, err
			}
			var document bson.M
			if err := bson.UnmarshalExtJSON(data, true, &document); err != nil {
				return nil, err
			}
			return document["value"], nil
		}
		result := bson.M{}
		originalMap, _ := original.(bson.M)
		if document, ok := original.(bson.D); ok {
			originalMap = bson.M{}
			for _, element := range document {
				originalMap[element.Key] = element.Value
			}
		}
		for key, item := range value {
			converted, err := restoreBSON(item, originalMap[key])
			if err != nil {
				return nil, err
			}
			result[key] = converted
		}
		return result, nil
	case []any:
		result := make(bson.A, len(value))
		originalList, _ := original.(bson.A)
		for index, item := range value {
			var previous any
			if index < len(originalList) {
				previous = originalList[index]
			}
			converted, err := restoreBSON(item, previous)
			if err != nil {
				return nil, err
			}
			result[index] = converted
		}
		return result, nil
	default:
		return value, nil
	}
}

type querier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func recordType(ctx context.Context, db querier, gameID, id string) (string, error) {
	var name string
	err := db.QueryRow(ctx, `SELECT t.name FROM game_data.records r JOIN game_data.record_types t USING(game_id,record_type_id) WHERE r.game_id=$1 AND r.record_id::text=$2`, gameID, id).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("record %s does not exist", id)
	}
	if err != nil {
		return "", fmt.Errorf("look up record %s: %w", id, err)
	}
	return name, nil
}

func (store *Records) RecordType(ctx context.Context, id string) (string, error) {
	return recordType(ctx, store.Pool, store.GameID, id)
}

func readFragments(ctx context.Context, tx pgx.Tx, gameID, revision, id string, storage *recordStorage, data map[string]any) error {
	rows, err := tx.Query(ctx, `SELECT f.contributor_id::text,f.payload_bson FROM game_data.record_fragments f
 JOIN game_data.revision_contributors c ON c.game_id=f.game_id AND c.contributor_id=f.contributor_id AND c.revision_id=$3
 WHERE f.game_id=$1 AND f.record_id=$2 ORDER BY c.load_position`, gameID, id, revision)
	if err != nil {
		return fmt.Errorf("load fragments of record %s: %w", id, err)
	}
	defer rows.Close()
	for rows.Next() {
		var owner string
		var payload []byte
		if err := rows.Scan(&owner, &payload); err != nil {
			return fmt.Errorf("scan fragment of record %s: %w", id, err)
		}
		var fragment bson.M
		if err := bson.Unmarshal(payload, &fragment); err != nil {
			return fmt.Errorf("decode fragment %s of record %s: %w", owner, id, err)
		}
		storage.fragments[owner] = fragment
		for field, value := range fragment {
			if _, exists := storage.owners[field]; exists {
				return fmt.Errorf("field %q occurs in multiple fragments; explicit composition rules are required", field)
			}
			storage.owners[field] = owner
			normalized, err := normalizeBSON(value)
			if err != nil {
				return err
			}
			data[field] = normalized
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("load fragments of record %s: %w", id, err)
	}
	return nil
}

func RecordView(ctx context.Context, tx pgx.Tx, gameID, id string) (string, map[string]any, error) {
	var revision, typeName string
	err := tx.QueryRow(ctx, `SELECT g.active_revision_id::text,t.name FROM game_data.records r
 JOIN game_data.games g ON g.game_id=r.game_id
 JOIN game_data.record_types t ON t.game_id=r.game_id AND t.record_type_id=r.record_type_id
 WHERE r.game_id=$1 AND r.record_id::text=$2`, gameID, id).Scan(&revision, &typeName)
	if err != nil {
		return "", nil, fmt.Errorf("view record %s: %w", id, err)
	}
	data := map[string]any{}
	storage := &recordStorage{owners: map[string]string{}, fragments: map[string]bson.M{}}
	if err := readFragments(ctx, tx, gameID, revision, id, storage, data); err != nil {
		return "", nil, err
	}
	return typeName, data, nil
}
