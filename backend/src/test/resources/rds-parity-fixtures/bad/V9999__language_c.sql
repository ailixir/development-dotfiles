-- Negative fixture: C-language function
-- Expected violation: line 7

CREATE FUNCTION add_one(integer)
RETURNS integer
AS 'libcustom', 'add_one'
LANGUAGE C STRICT;
