BEGIN;

CREATE SCHEMA hosting;

CREATE TABLE hosting.installation (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    schema_version integer NOT NULL CHECK (schema_version > 0)
);
INSERT INTO hosting.installation(schema_version) VALUES (2);

CREATE TABLE hosting.servers (
    server_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX servers_name ON hosting.servers (name);
INSERT INTO hosting.servers(server_id, name)
    VALUES ('00000000-0000-0000-0000-000000000000', 'default');

CREATE SCHEMA accounts;

CREATE TABLE accounts.users (
    user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
        REFERENCES hosting.servers ON DELETE CASCADE,
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (server_id, user_id)
);

CREATE TABLE accounts.passwords (
    user_id uuid PRIMARY KEY,
    server_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_.-]{3,32}$'),
    hash text NOT NULL CHECK (hash LIKE '$argon2id$%'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (server_id, user_id)
        REFERENCES accounts.users (server_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX passwords_username ON accounts.passwords (server_id, lower(username));

CREATE TABLE accounts.identities (
    server_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    subject text NOT NULL CHECK (btrim(subject) <> ''),
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (server_id, provider, subject),
    FOREIGN KEY (server_id, user_id)
        REFERENCES accounts.users (server_id, user_id) ON DELETE CASCADE
);
CREATE INDEX identities_by_user ON accounts.identities (user_id);

CREATE TABLE accounts.sessions (
    token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id uuid NOT NULL REFERENCES accounts.users ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_by_user ON accounts.sessions (user_id);

CREATE TABLE accounts.oauth_states (
    state_hash bytea PRIMARY KEY CHECK (octet_length(state_hash) = 32),
    server_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
        REFERENCES hosting.servers ON DELETE CASCADE,
    provider text NOT NULL,
    verifier text NOT NULL,
    link_user_id uuid REFERENCES accounts.users ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE TABLE accounts.administrators (
    user_id uuid PRIMARY KEY REFERENCES accounts.users ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE SCHEMA game_data;

CREATE TABLE game_data.games (
    game_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
        REFERENCES hosting.servers ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'game' CHECK (kind IN ('game', 'server')),
    name text NOT NULL CHECK (btrim(name) <> ''),
    application_id uuid NOT NULL,
    application_kind text NOT NULL DEFAULT 'application' CHECK (application_kind = 'application'),
    active_revision_id uuid,
    access text NOT NULL DEFAULT 'invite' CHECK (access IN ('open', 'invite')),
    modules text[] NOT NULL DEFAULT '{}',
    lifecycle text NOT NULL DEFAULT 'auto' CHECK (lifecycle IN ('auto', 'stopped', 'suspended')),
    suspended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((lifecycle = 'suspended') = (suspended_at IS NOT NULL))
);
CREATE INDEX games_by_server ON game_data.games (server_id, created_at);
CREATE UNIQUE INDEX one_storage_per_server_application
    ON game_data.games (server_id, name) WHERE kind = 'server';

CREATE TABLE game_data.automations (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    name text NOT NULL CHECK (name ~ '^[A-Za-z_][A-Za-z0-9_.-]*$'),
    creator_kind text NOT NULL CHECK (creator_kind IN ('system', 'user')),
    creator_id text NOT NULL CHECK (btrim(creator_id) <> ''),
    definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, name),
    CHECK (definition->>'name' IS NOT NULL AND definition->>'name' = name)
);

CREATE TABLE game_data.contributors (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    contributor_id uuid NOT NULL DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('application', 'module', 'kit')),
    name text NOT NULL CHECK (btrim(name) <> ''),
    PRIMARY KEY (game_id, contributor_id),
    UNIQUE (game_id, name),
    UNIQUE (game_id, contributor_id, kind)
);
CREATE UNIQUE INDEX one_application_per_game
    ON game_data.contributors (game_id) WHERE kind = 'application';
ALTER TABLE game_data.games ADD CONSTRAINT game_application
    FOREIGN KEY (game_id, application_id, application_kind)
    REFERENCES game_data.contributors (game_id, contributor_id, kind)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE game_data.record_types (
    game_id uuid NOT NULL,
    record_type_id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (btrim(name) <> ''),
    introduced_by uuid NOT NULL,
    PRIMARY KEY (game_id, record_type_id),
    UNIQUE (game_id, name),
    FOREIGN KEY (game_id, introduced_by)
        REFERENCES game_data.contributors (game_id, contributor_id)
);

CREATE TABLE game_data.contract_revisions (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    revision_id uuid NOT NULL DEFAULT gen_random_uuid(),
    parent_revision_id uuid,
    schema_format text NOT NULL CHECK (btrim(schema_format) <> ''),
    composer_version text NOT NULL CHECK (btrim(composer_version) <> ''),
    manifest_sha256 bytea CHECK (octet_length(manifest_sha256) = 32),
    sealed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, revision_id),
    FOREIGN KEY (game_id, parent_revision_id)
        REFERENCES game_data.contract_revisions (game_id, revision_id),
    CHECK (parent_revision_id IS DISTINCT FROM revision_id),
    CHECK (sealed_at IS NULL OR manifest_sha256 IS NOT NULL)
);
ALTER TABLE game_data.games ADD CONSTRAINT game_active_revision
    FOREIGN KEY (game_id, active_revision_id)
    REFERENCES game_data.contract_revisions (game_id, revision_id);

CREATE TABLE game_data.revision_contributors (
    game_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    contributor_id uuid NOT NULL,
    contributor_kind text NOT NULL CHECK (contributor_kind IN ('application', 'module', 'kit')),
    load_position integer NOT NULL CHECK (load_position >= 0),
    package_version text NOT NULL CHECK (btrim(package_version) <> ''),
    package_sha256 bytea NOT NULL CHECK (octet_length(package_sha256) = 32),
    PRIMARY KEY (game_id, revision_id, contributor_id),
    UNIQUE (game_id, revision_id, load_position),
    CHECK ((contributor_kind = 'application' AND load_position = 0)
        OR (contributor_kind IN ('module', 'kit') AND load_position > 0)),
    FOREIGN KEY (game_id, revision_id)
        REFERENCES game_data.contract_revisions (game_id, revision_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id, contributor_id, contributor_kind)
        REFERENCES game_data.contributors (game_id, contributor_id, kind)
);

CREATE TABLE game_data.schema_contributions (
    game_id uuid NOT NULL,
    contribution_id uuid NOT NULL DEFAULT gen_random_uuid(),
    record_type_id uuid NOT NULL,
    contributor_id uuid NOT NULL,
    name text NOT NULL CHECK (btrim(name) <> ''),
    PRIMARY KEY (game_id, contribution_id),
    UNIQUE (game_id, contributor_id, record_type_id, name),
    UNIQUE (game_id, contribution_id, record_type_id, contributor_id),
    FOREIGN KEY (game_id, record_type_id)
        REFERENCES game_data.record_types (game_id, record_type_id),
    FOREIGN KEY (game_id, contributor_id)
        REFERENCES game_data.contributors (game_id, contributor_id)
);

CREATE TABLE game_data.revision_contributions (
    game_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    contribution_id uuid NOT NULL,
    record_type_id uuid NOT NULL,
    contributor_id uuid NOT NULL,
    contribution_order integer NOT NULL CHECK (contribution_order >= 0),
    action text NOT NULL CHECK (action IN ('define', 'modify')),
    target_contribution_id uuid,
    payload_bson bytea NOT NULL CHECK (octet_length(payload_bson) >= 5),
    PRIMARY KEY (game_id, revision_id, contribution_id),
    UNIQUE (game_id, revision_id, contribution_id, record_type_id),
    UNIQUE (game_id, revision_id, contributor_id, contribution_order),
    FOREIGN KEY (game_id, contribution_id, record_type_id, contributor_id)
        REFERENCES game_data.schema_contributions
            (game_id, contribution_id, record_type_id, contributor_id),
    FOREIGN KEY (game_id, revision_id, contributor_id)
        REFERENCES game_data.revision_contributors (game_id, revision_id, contributor_id)
        ON DELETE CASCADE,
    FOREIGN KEY (game_id, revision_id, target_contribution_id, record_type_id)
        REFERENCES game_data.revision_contributions
            (game_id, revision_id, contribution_id, record_type_id)
        DEFERRABLE INITIALLY DEFERRED,
    CHECK ((action = 'define' AND target_contribution_id IS NULL)
        OR (action = 'modify' AND target_contribution_id IS NOT NULL)),
    CHECK (target_contribution_id IS DISTINCT FROM contribution_id)
);

CREATE TABLE game_data.effective_schemas (
    game_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    record_type_id uuid NOT NULL,
    payload_bson bytea NOT NULL CHECK (octet_length(payload_bson) >= 5),
    PRIMARY KEY (game_id, revision_id, record_type_id),
    FOREIGN KEY (game_id, revision_id)
        REFERENCES game_data.contract_revisions (game_id, revision_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id, record_type_id)
        REFERENCES game_data.record_types (game_id, record_type_id)
);

CREATE TABLE game_data.records (
    game_id uuid NOT NULL,
    record_id uuid NOT NULL DEFAULT gen_random_uuid(),
    record_type_id uuid NOT NULL,
    record_version bigint NOT NULL DEFAULT 1 CHECK (record_version > 0),
    last_validated_revision_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, record_id),
    FOREIGN KEY (game_id, record_type_id)
        REFERENCES game_data.record_types (game_id, record_type_id),
    FOREIGN KEY (game_id, last_validated_revision_id, record_type_id)
        REFERENCES game_data.effective_schemas (game_id, revision_id, record_type_id)
);
CREATE INDEX records_by_type ON game_data.records (game_id, record_type_id, record_id);

CREATE TABLE game_data.record_fragments (
    game_id uuid NOT NULL,
    record_id uuid NOT NULL,
    contributor_id uuid NOT NULL,
    payload_bson bytea NOT NULL CHECK (octet_length(payload_bson) >= 5),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, record_id, contributor_id),
    FOREIGN KEY (game_id, record_id)
        REFERENCES game_data.records (game_id, record_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id, contributor_id)
        REFERENCES game_data.contributors (game_id, contributor_id)
);
CREATE INDEX fragments_by_owner ON game_data.record_fragments (game_id, contributor_id);

CREATE FUNCTION game_data.protect_revision_contents() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    revision_game uuid;
    revision_key uuid;
    sealed timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('easel.delete_game', true) = OLD.game_id::text THEN
            RETURN OLD;
        END IF;
        revision_game := OLD.game_id;
        revision_key := OLD.revision_id;
    ELSE
        revision_game := NEW.game_id;
        revision_key := NEW.revision_id;
    END IF;
    IF TG_OP = 'UPDATE' AND
        (OLD.game_id, OLD.revision_id) IS DISTINCT FROM (NEW.game_id, NEW.revision_id) THEN
        RAISE EXCEPTION 'Revision contents cannot move between revisions';
    END IF;
    SELECT sealed_at INTO sealed FROM game_data.contract_revisions
        WHERE game_id = revision_game AND revision_id = revision_key FOR UPDATE;
    IF sealed IS NOT NULL THEN
        RAISE EXCEPTION 'Sealed revision contents are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_revision_contributors BEFORE INSERT OR UPDATE OR DELETE
    ON game_data.revision_contributors FOR EACH ROW
    EXECUTE FUNCTION game_data.protect_revision_contents();
CREATE TRIGGER protect_revision_contributions BEFORE INSERT OR UPDATE OR DELETE
    ON game_data.revision_contributions FOR EACH ROW
    EXECUTE FUNCTION game_data.protect_revision_contents();
CREATE TRIGGER protect_effective_schemas BEFORE INSERT OR UPDATE OR DELETE
    ON game_data.effective_schemas FOR EACH ROW
    EXECUTE FUNCTION game_data.protect_revision_contents();

CREATE FUNCTION game_data.protect_sealed_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('easel.delete_game', true) = OLD.game_id::text THEN
        RETURN OLD;
    END IF;
    IF OLD.sealed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Sealed revisions are immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND
        (OLD.game_id, OLD.revision_id) IS DISTINCT FROM (NEW.game_id, NEW.revision_id) THEN
        RAISE EXCEPTION 'Revision identity is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_sealed_revision BEFORE UPDATE OR DELETE
    ON game_data.contract_revisions FOR EACH ROW
    EXECUTE FUNCTION game_data.protect_sealed_revision();

CREATE FUNCTION game_data.require_sealed_active_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active_revision_id IS NOT NULL THEN
        PERFORM 1 FROM game_data.contract_revisions
            WHERE game_id = NEW.game_id AND revision_id = NEW.active_revision_id
                AND sealed_at IS NOT NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Only a sealed revision can be activated';
        END IF;
        PERFORM 1 FROM game_data.revision_contributors
            WHERE game_id = NEW.game_id AND revision_id = NEW.active_revision_id
                AND contributor_id = NEW.application_id AND load_position = 0;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Active revision must include the game application first';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_sealed_active_revision BEFORE INSERT OR UPDATE
    ON game_data.games FOR EACH ROW
    EXECUTE FUNCTION game_data.require_sealed_active_revision();

CREATE TABLE game_data.security_principals (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    id uuid NOT NULL,
    principal_type text NOT NULL CHECK (btrim(principal_type) <> ''),
    attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
    PRIMARY KEY (game_id, id)
);

CREATE TABLE game_data.security_relationships (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    subject_id uuid NOT NULL,
    relation text NOT NULL CHECK (btrim(relation) <> ''),
    object_id uuid NOT NULL,
    PRIMARY KEY (game_id, id),
    FOREIGN KEY (game_id, subject_id) REFERENCES game_data.security_principals(game_id, id) ON DELETE CASCADE,
    UNIQUE (game_id, subject_id, relation, object_id)
);
CREATE INDEX security_relationship_object
    ON game_data.security_relationships(game_id, object_id, relation);

CREATE TABLE game_data.security_registries (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    build_id text NOT NULL CHECK (btrim(build_id) <> ''),
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (game_id)
);

CREATE TABLE game_data.security_assignments (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    principal_id uuid NOT NULL,
    permission text NOT NULL CHECK (btrim(permission) <> ''),
    resource_id uuid,
    effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
    PRIMARY KEY (game_id, id),
    FOREIGN KEY (game_id, principal_id) REFERENCES game_data.security_principals(game_id, id) ON DELETE CASCADE,
    UNIQUE NULLS NOT DISTINCT (game_id, principal_id, permission, resource_id)
);
CREATE INDEX security_assignment_resource ON game_data.security_assignments(game_id, resource_id, permission);

CREATE TABLE game_data.members (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES accounts.users ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, user_id)
);
CREATE INDEX members_by_user ON game_data.members (user_id);

CREATE TABLE game_data.files (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    file_id uuid NOT NULL DEFAULT gen_random_uuid(),
    sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
    media_type text NOT NULL CHECK (btrim(media_type) <> ''),
    size bigint NOT NULL CHECK (size >= 0),
    name text NOT NULL DEFAULT '',
    owner_id uuid,
    file_version bigint NOT NULL DEFAULT 1 CHECK (file_version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, file_id)
);
CREATE INDEX files_by_content ON game_data.files (game_id, sha256);

CREATE TABLE game_data.scheduled_events (
    game_id uuid NOT NULL REFERENCES game_data.games ON DELETE CASCADE,
    schedule_id uuid NOT NULL DEFAULT gen_random_uuid(),
    owner text NOT NULL,
    name text NOT NULL CHECK (btrim(name) <> ''),
    payload jsonb NOT NULL DEFAULT '{}',
    remaining_ms bigint NOT NULL CHECK (remaining_ms >= 0),
    PRIMARY KEY (game_id, schedule_id)
);

CREATE TABLE game_data.runtime_owners (
    game_id uuid PRIMARY KEY REFERENCES game_data.games ON DELETE CASCADE,
    instance_id uuid NOT NULL,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    heartbeat_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
