-- Le front lit désormais monthly_stats et commune_stats : les vues de compatibilité sont retirées
drop view if exists mv_monthly_stats;
drop view if exists mv_commune_stats;
