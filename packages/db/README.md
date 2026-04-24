# Database Notes

This schema follows the entities described in the SRS:

- `app_user`
- `photo`
- `face`
- `person_cluster`

## Assumptions

- Authentication is delegated to Firebase, while app-specific user records stay in PostgreSQL.
- Face embeddings are stored with `pgvector`.
- Photos are stored in object storage, while URLs and metadata are stored in PostgreSQL.

## Next Step

Once you provide PostgreSQL access, we can turn `schema.sql` into migrations and start wiring the API to real queries.
