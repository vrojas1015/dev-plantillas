# Releases

Una nota por release (`releases/vX.Y.Z.md`): qué entra, migraciones, pasos
manuales y rollback. El frontmatter dice qué versión de cada servicio está en
QA y en prod; de ahí sale el [rollout](../_generado/rollout.md).

Release nueva: `make nuevo TIPO=release VERSION=X.Y.Z [REPOS=<repo>,<repo>]`.
