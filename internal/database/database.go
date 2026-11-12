package database

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	connectTimeout = 5 * time.Second
	maxConnections = 10
)

type Config struct {
	Host     string `json:"host"`
	Port     uint16 `json:"port"`
	Database string `json:"database"`
	User     string `json:"user"`
	Password string `json:"password"`
	SSLMode  string `json:"sslmode"`
}

func LoadConfig(path string) (Config, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read database settings %s: %w", path, err)
	}
	var settings Config
	if err := json.Unmarshal(contents, &settings); err != nil {
		return Config{}, fmt.Errorf("invalid database settings in %s: %w", path, err)
	}
	if settings.Host == "" || settings.Port == 0 || settings.Database == "" || settings.User == "" || settings.SSLMode == "" {
		return Config{}, fmt.Errorf("database settings in %s require host, port, database, user, and sslmode", path)
	}
	return settings, nil
}

func Open(ctx context.Context, settings Config) (*pgxpool.Pool, error) {
	connectionURL := &url.URL{
		Scheme: "postgres",
		Host:   net.JoinHostPort(settings.Host, strconv.Itoa(int(settings.Port))),
		User:   url.UserPassword(settings.User, settings.Password),
		Path:   "/" + settings.Database,
	}
	parameters := url.Values{"sslmode": {settings.SSLMode}}
	connectionURL.RawQuery = parameters.Encode()
	poolConfig, err := pgxpool.ParseConfig(connectionURL.String())
	if err != nil {
		return nil, fmt.Errorf("invalid PostgreSQL connection settings: %w", err)
	}
	poolConfig.ConnConfig.ConnectTimeout = connectTimeout
	poolConfig.ConnConfig.RuntimeParams["application_name"] = "easel"
	poolConfig.MaxConns = maxConnections
	startupContext, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(startupContext, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create database connection pool: %w", err)
	}
	if err := pool.Ping(startupContext); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	return pool, nil
}

func BeginSerializable(ctx context.Context, pool *pgxpool.Pool) (pgx.Tx, error) {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, fmt.Errorf("begin serializable transaction: %w", err)
	}
	return tx, nil
}
