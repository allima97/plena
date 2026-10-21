CREATE TABLE IF NOT EXISTS auth_email_usage (
	billing_period TEXT PRIMARY KEY,
	count INTEGER NOT NULL CHECK (count BETWEEN 0 AND 2500)
);
