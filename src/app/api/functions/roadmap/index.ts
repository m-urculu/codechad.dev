export async function define_roadmaps(req: Request) {
	console.log('define_roadmaps handler called in roadmap/index.ts');
	const body = await req.json();
	const previousMessages = body.previousMessages || [];
	console.log('[define_roadmaps] previousMessages:', previousMessages);
	// Return a Response object so sys-manager can call .json() on it
	return new Response(JSON.stringify({ status: 'ok', message: 'define_roadmaps handler reached', previousMessagesCount: previousMessages.length }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
