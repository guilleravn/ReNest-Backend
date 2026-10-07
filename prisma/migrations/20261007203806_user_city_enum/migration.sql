-- users.city: free text -> fixed list (AUTH-1). Labels live in the frontend.
CREATE TYPE "city" AS ENUM ('COCHABAMBA_BO', 'AREQUIPA_PE', 'SAN_SALVADOR_SV', 'UTAH_US');

-- Cast instead of drop + add, so existing rows keep their value. Fails loudly
-- if a row holds a city outside the list.
ALTER TABLE "users" ALTER COLUMN "city" TYPE "city" USING "city"::"city";
