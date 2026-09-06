-- Allow 'revoke-credits' in the moderation audit trail.
--
-- The orders sweep writes a row when it claws credits back from an
-- unconfirmed claim, so that the revocation survives even if every attempt to
-- notify a human fails. The existing vocabulary had no word for it, and the
-- nearest one — 'revoke-sessions' — means signing somebody out of their
-- devices. Reusing it would leave an audit trail that lies about what
-- happened, which defeats the point of having one.

alter table ir_moderation_actions
  drop constraint if exists ir_moderation_actions_action_check;

alter table ir_moderation_actions
  add constraint ir_moderation_actions_action_check
  check (action in (
    'block',
    'unblock',
    'hide',
    'unhide',
    'revoke-sessions',
    -- Credits taken back from an order nobody confirmed inside the grace
    -- window. Written by the orders sweep, never by a person.
    'revoke-credits'
  ));
