ALTER TABLE private.player_claim_emails
  DROP CONSTRAINT IF EXISTS player_claim_email_normalized;
--> statement-breakpoint
ALTER TABLE private.player_claim_emails
  ADD CONSTRAINT player_claim_email_normalized CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  );
--> statement-breakpoint
ALTER TABLE app.decks
  DROP CONSTRAINT IF EXISTS decks_moxfield_https_url;
--> statement-breakpoint
ALTER TABLE app.decks
  ADD CONSTRAINT decks_moxfield_https_url CHECK (
    moxfield_url IS NULL
    OR moxfield_url ~* '^https://(www[.])?moxfield[.]com/decks/[A-Za-z0-9_-]+/?([?#].*)?$'
  );
