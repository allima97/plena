/** Normaliza a identidade verificada pelo Cloudflare Access para particionar os dados. */
export function dataOwner(locals) {
	const email = locals?.user?.email;
	return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

export function isLegacyDataOwner(owner, env) {
	const configured = env?.LEGACY_DATA_OWNER_EMAIL;
	return typeof configured === 'string' && configured.trim().toLowerCase() === owner;
}

/** Reivindica os registros antigos sem dono exclusivamente para a conta principal configurada. */
export async function claimLegacyData(db, owner, env) {
	if (!isLegacyDataOwner(owner, env)) return;
	await db.prepare("UPDATE documents SET owner_email = ? WHERE owner_email = ''").bind(owner).run();
}
