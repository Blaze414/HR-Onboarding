-- Two things the workspace was guessing at.
--
-- 1. Contractors. The employment particulars offered ongoing, fixed term or
--    casual, so anybody engaged on a contract was being recorded as one of the
--    three things they are not. That is not a cosmetic gap: most of what this
--    app tracks — the Fair Work Information Statement, the casual statement,
--    the employee choice pathway — is owed to *employees*, and quietly filing a
--    contractor as an employee makes the workspace owe them things it does not,
--    and report gaps that are not gaps.
--
-- 2. Small business employer. The threshold decides real things: twelve months
--    before a casual may ask to go permanent instead of six, and a different
--    schedule for the casual statement. It was being answered by counting rows
--    in this table, which is the rough shape of s.23 and wrong in two specific
--    ways — it ignores associated entities, and it counts every casual when the
--    Act counts only those employed on a regular and systematic basis.
--
--    Neither of those can be derived from anything this app holds. They are
--    questions about the business, so they are asked as questions.

-- ------------------------------------------------------------- contractors
alter type employment_basis add value if not exists 'Contract';

comment on column profiles.employment_basis is
  'Ongoing, fixed term, casual or contract. The first three are employees; a contractor is not, and is owed none of the employee statements.';
