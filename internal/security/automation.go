package security

import (
	"context"
	"errors"
	"fmt"

	"easel/internal/automation"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) RecordAuthorizer(service *SecurityService) func(context.Context, pgx.Tx, string, automation.Record) error {
	return func(ctx context.Context, tx pgx.Tx, action string, record automation.Record) error {
		resource := record.ID
		if resource == "" {
			resource = typeResource(record.Type)
		}
		return service.RequireIn(ctx, s.ViewTransaction(tx), AuthorizationRequest{ResourceID: resource, Action: action})
	}
}

type AutomationAccess struct {
	Service *SecurityService
	Request func(string, automation.Saved) (AuthorizationRequest, error)
}

func (s *PostgresStore) AutomationAuthorizer(service *SecurityService, mapping func(string, automation.Saved) (AuthorizationRequest, error)) func(context.Context, pgx.Tx, string, automation.Saved) error {
	return func(ctx context.Context, tx pgx.Tx, action string, saved automation.Saved) error {
		if mapping == nil {
			return fmt.Errorf("automation security mapping is not configured")
		}
		request, err := mapping(action, saved)
		if err != nil {
			return err
		}
		return service.RequireIn(ctx, s.ViewTransaction(tx), request)
	}
}

func (a AutomationAccess) Authorize(ctx context.Context, action string, saved automation.Saved) error {
	if a.Service == nil || a.Request == nil {
		return fmt.Errorf("automation security mapping is not configured")
	}
	request, err := a.Request(action, saved)
	if err != nil {
		return err
	}
	if err := a.Service.Require(ctx, request); errors.Is(err, ErrDenied) {
		return fmt.Errorf("%w: %w", automation.ErrDenied, err)
	} else if err != nil {
		return err
	}
	return nil
}
