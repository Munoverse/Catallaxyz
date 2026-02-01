# Supabase Client Library

This directory contains Supabase client-related code.

## ⚠️ Important Notes

**Database schema file location:**

The database schema has been moved to the project root `database/` folder:

```
/database/schema.sql  ← single source of truth for the schema
```

Please **do not** create or modify schema files in this directory.

## 📁 Directory Structure

```
supabase/
├── README.md              ← this file
├── test-connection.ts     ← Supabase connection test
└── migrations/            ← database migration files (if needed)
```

## 🔗 Related Docs

- Database docs: `/database/README.md`
- Database schema: `/database/schema.sql`
- Supabase docs: https://supabase.com/docs

## 💡 Usage

### Connect to the database

```typescript
import { createServerClient } from '@/lib/supabase';

const supabase = createServerClient();
```

### Test connection

```bash
# Run the test script
npm run test:supabase
```

## 📝 Notes

1. **Schema management**: all schema changes go in `/database/schema.sql`
2. **Client code**: this directory only contains client connection and query code
3. **Type definitions**: generate types from `/database/schema.sql`

## 🎯 Quick Links

- [Full database docs](../../../database/README.md)
- [Database schema](../../../database/schema.sql)
