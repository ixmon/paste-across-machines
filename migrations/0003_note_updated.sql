-- Track when the note body last changed (reads must not bump this).

ALTER TABLE paste_sessions
  ADD COLUMN IF NOT EXISTS note_updated_at BIGINT;

UPDATE paste_sessions
   SET note_updated_at = last_accessed_at
 WHERE note_updated_at IS NULL;
