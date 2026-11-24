-- Who runs this instance and how to reach them, for the privacy and terms pages and the Reply-To
-- of outgoing mail. NULL means "use the deployment's default" (OPERATOR_NAME, LEGAL_CONTACT_EMAIL).
ALTER TABLE org ADD COLUMN operator_name TEXT;
ALTER TABLE org ADD COLUMN operator_contact TEXT;
