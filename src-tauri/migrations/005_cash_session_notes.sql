-- Cash session notes & denomination count (migration 5).
-- Persists the opening note and the closing denomination tally for the cash
-- register reconciliation workflow. The existing `note` column on
-- cash_sessions is used as the closing note. Additive and nullable, so this is
-- safe to apply on an existing database.

ALTER TABLE cash_sessions ADD COLUMN opening_note TEXT;

-- JSON map of denomination (minor units) -> quantity counted at close, e.g.
-- {"200000": 10, "100000": 5}. Lets the history view show how the physical
-- count was reached.
ALTER TABLE cash_sessions ADD COLUMN count_breakdown_json TEXT;
