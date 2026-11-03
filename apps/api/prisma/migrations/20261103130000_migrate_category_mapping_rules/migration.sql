-- Moves the active category mapping rules onto the rules engine, then drops category_mapping_rules.
--
-- One-way: there is no down migration. Deliberately not copied:
--   * inactive rows (every rule a user deleted was soft-deleted to is_active = false);
--   * combinations the old matcher could never apply: an amount with a text operator, an amount value that is
--     not a non-negative number, and rules pointing at a soft-deleted category.
--
-- Each copied rule gets one condition, one set_category action and stop on match. Priorities are renumbered 1..n per
-- user in the old effective order (priority ASC, created_at DESC), so the run order is unchanged.
--
-- Names are built like autoRuleName in @badger/utils. apps/api/src/rules/legacy-rule-migration.spec.ts pins that.

WITH src AS (
    SELECT
        r.id,
        r.user_id,
        r.category_id,
        r.field,
        r.operator,
        CASE WHEN r.field = 'amount' THEN trim(r.value) ELSE r.value END AS value,
        r.priority,
        r.created_at,
        r.updated_at
    FROM category_mapping_rules r
    JOIN categories c ON c.id = r.category_id AND c.deleted_at IS NULL
    WHERE r.is_active = true
      AND (
        (r.field IN ('description', 'originalCategory') AND r.operator IN ('contains', 'equals', 'startsWith', 'endsWith'))
        OR (r.field = 'amount' AND r.operator IN ('greaterThan', 'lessThan', 'equals') AND trim(r.value) ~ '^[0-9]+(\.[0-9]+)?$')
      )
)
INSERT INTO rules (id, user_id, name, priority, stop_on_match, is_active, created_at, updated_at, deleted_at)
SELECT
    s.id,
    s.user_id,
    btrim(left(
        CASE s.field
            WHEN 'description' THEN 'Description'
            WHEN 'originalCategory' THEN 'Original category'
            WHEN 'amount' THEN 'Amount'
        END
        || ' ' ||
        CASE s.operator
            WHEN 'contains' THEN 'contains'
            WHEN 'equals' THEN 'is'
            WHEN 'startsWith' THEN 'starts with'
            WHEN 'endsWith' THEN 'ends with'
            WHEN 'greaterThan' THEN 'is more than'
            WHEN 'lessThan' THEN 'is less than'
        END
        || ' ' ||
        CASE WHEN s.field = 'amount' THEN to_char(s.value::numeric, 'FM999,999,999,990.00') ELSE s.value END,
        200)),
    ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.priority ASC, s.created_at DESC),
    true,
    true,
    s.created_at,
    s.updated_at,
    NULL
FROM src s;

WITH src AS (
    SELECT
        r.id,
        r.field,
        r.operator,
        CASE WHEN r.field = 'amount' THEN trim(r.value) ELSE r.value END AS value
    FROM category_mapping_rules r
    JOIN categories c ON c.id = r.category_id AND c.deleted_at IS NULL
    WHERE r.is_active = true
      AND (
        (r.field IN ('description', 'originalCategory') AND r.operator IN ('contains', 'equals', 'startsWith', 'endsWith'))
        OR (r.field = 'amount' AND r.operator IN ('greaterThan', 'lessThan', 'equals') AND trim(r.value) ~ '^[0-9]+(\.[0-9]+)?$')
      )
)
INSERT INTO rule_conditions (rule_id, field, operator, value, position)
SELECT s.id, s.field, s.operator, s.value, 0
FROM src s;

WITH src AS (
    SELECT r.id, r.category_id
    FROM category_mapping_rules r
    JOIN categories c ON c.id = r.category_id AND c.deleted_at IS NULL
    WHERE r.is_active = true
      AND (
        (r.field IN ('description', 'originalCategory') AND r.operator IN ('contains', 'equals', 'startsWith', 'endsWith'))
        OR (r.field = 'amount' AND r.operator IN ('greaterThan', 'lessThan', 'equals') AND trim(r.value) ~ '^[0-9]+(\.[0-9]+)?$')
      )
)
INSERT INTO rule_actions (rule_id, type, value, position)
SELECT s.id, 'set_category', s.category_id::text, 0
FROM src s;

DROP TABLE "category_mapping_rules";
