#!/bin/bash
# migrate.sh — Aplica migrations SQL pendentes no banco de dados
# Rastreia migrations aplicadas na tabela _migrations do próprio banco.
#
# Uso:
#   bash migrate.sh                    # produção (padrão)
#   POSTGRES_DB=meuzapdesk_dev bash migrate.sh   # dev

set -e

CONTAINER="${POSTGRES_CONTAINER:-meuzapdesk-postgres-1}"
PG_USER="${POSTGRES_USER:-meuzapdesk}"
PG_DB="${POSTGRES_DB:-meuzapdesk_prod}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../migrations" && pwd)"

run_sql() {
  docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "$1"
}

run_file() {
  docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" < "$1"
}

echo "==> [migrate] Banco: $PG_DB no container $CONTAINER"
echo "==> [migrate] Diretório: $MIGRATIONS_DIR"

# Cria tabela de controle se não existir
run_sql "
CREATE TABLE IF NOT EXISTS _migrations (
  name        VARCHAR(255) PRIMARY KEY,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
" > /dev/null

# Processa cada arquivo .sql em ordem
APPLIED=0
SKIPPED=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"

  # Verifica se já foi aplicada
  count=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc \
    "SELECT COUNT(*) FROM _migrations WHERE name = '$name';")

  if [ "$count" -gt 0 ]; then
    echo "  [skip] $name (já aplicada)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  [run]  $name ..."
  run_file "$file"
  run_sql "INSERT INTO _migrations(name) VALUES ('$name');" > /dev/null
  echo "  [ok]   $name aplicada."
  APPLIED=$((APPLIED + 1))
done

echo ""
echo "==> [migrate] Concluído: $APPLIED aplicada(s), $SKIPPED ignorada(s)."
