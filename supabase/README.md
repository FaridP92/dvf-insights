# Supabase : déploiement

État actuel : projet `ntfeumptvwcrwoxzprbb` (région eu-west-3) créé le 28 août 2026, migrations 0001 à 0006 appliquées (schéma, RPC, durcissement, purge par période, purge par département, maintenance asynchrone pg_cron), Edge Functions `ingest-dvf` et `pipeline-status` déployées (auth custom, `verify_jwt` désactivé). Reste à poser le secret `N8N_WEBHOOK_SECRET` (Dashboard > Edge Functions > Secrets) et le même secret dans le credential Header Auth n8n.

Pour redéployer ou répliquer :

```bash
supabase login
supabase link --project-ref <ref>
supabase db push                                   # applique supabase/migrations/*.sql
supabase secrets set N8N_WEBHOOK_SECRET=<secret partagé avec n8n>
supabase functions deploy ingest-dvf
supabase functions deploy pipeline-status
```

Puis renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Vercel > Settings > Environment Variables) : le front bascule automatiquement du mode mock au mode live.

## Sécurité

- La clé `service_role` n'existe que dans les secrets des Edge Functions et dans n8n. Jamais côté client.
- Les tables brutes n'ont aucune policy `select` : invisibles avec la clé anon.
- Les webhooks sont authentifiés par signature HMAC-SHA256 (`x-signature`) ou par secret partagé (`x-webhook-secret`, credential Header Auth n8n), comparaison en temps constant.
