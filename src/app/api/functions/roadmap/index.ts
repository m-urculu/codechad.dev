
import { callGemini } from '@/lib/gemini';
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { insertChatMessage } from '@/app/api/supabase/chat-message';

export async function define_roadmaps(req: Request) {
	const body = await req.json();
	const user_id = body.user_id;
	const user_message = body.message;
	const previousMessages = body.previousMessages || [];

	// 1. Build roadmap archetype list from filenames (for Gemini selection)
	const archetypes = [
		'ai-agents','ai-data-scientist','ai-engineer','ai-red-teaming','android','angular','api-design','aspnet-core','aws','backend','bi-analyst','blockchain','cloudflare','computer-science','cpp','cyber-security','data-analyst','data-engineer','datastructures-and-algorithms','design-system','devops','devrel','docker','engineering-manager','flutter','frontend','full-stack','game-developer','git-github','golang','graphql','ios','java','javascript','kubernetes','linux','machine-learning','mlops','mongodb','nextjs','nodejs','php','postgresql-dba','product-manager','prompt-engineering','python','qa','react-native','react','redis','rust','server-side-game-developer','software-architect','software-design-architecture','spring-boot','sql','system-design','technical-writer','terraform','typescript','ux-design','vue'
	];

	// 2. Send prompt to AI to select a roadmap
	const prompt = `Given the user's message: "${user_message}", select the most relevant roadmap archetype from this list: ${archetypes.join(", ")}. Respond in JSON: { "roadmap": "archetype-key", "message": "user-facing message" }`;
	const aiResponse = await callGemini(prompt);
	let selectedRoadmap = '';
	let userMessage = '';
	try {
		const parsed = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : {};
		selectedRoadmap = (parsed.roadmap || '').trim().toLowerCase();
		userMessage = parsed.message || '';
	} catch {
		// fallback: treat aiResponse as just the roadmap key
		selectedRoadmap = typeof aiResponse === 'string' ? aiResponse.trim().toLowerCase() : '';
		userMessage = '';
	}

	// 2.5. Retrieve roadmap info from Supabase
	let roadmapInfo = null;
	let roadmapSummary = '';
	if (selectedRoadmap) {
		const { data, error } = await supabase
			.from('roadmaps')
			.select('key, title, description, content')
			.eq('key', selectedRoadmap)
			.single();
		console.log('[define_roadmaps] DB read for key:', selectedRoadmap, 'error:', error, 'data:', data);
		if (!error && data) {
			roadmapInfo = data;
			// Compose a readable summary for the user
			roadmapSummary = `**${data.title || selectedRoadmap}**\n\n${data.description || ''}`;
			if (data.content && typeof data.content === 'object') {
				// Optionally, add a preview of the first steps or sections
				const steps = data.content.steps || data.content.sections || [];
				if (Array.isArray(steps) && steps.length > 0) {
					roadmapSummary += `\n\n**First steps:**`;
					steps.slice(0, 3).forEach((step, idx) => {
						if (typeof step === 'string') {
							roadmapSummary += `\n${idx + 1}. ${step}`;
						} else if (step.title) {
							roadmapSummary += `\n${idx + 1}. ${step.title}`;
						}
					});
				}
			}
		}
	}
	// 3. Save the selected roadmap to the database and update user_step_fulfillment
	let dbStatus = 'not saved';
	if (user_id && selectedRoadmap && archetypes.includes(selectedRoadmap)) {
		const { error } = await supabase
			.from('user_roadmaps')
			.upsert({ user_id, roadmap_key: selectedRoadmap });
		if (!error) {
			// Set define_roadmaps_done to TRUE in user_step_fulfillment
			const { error: stepError } = await supabase
				.from('user_step_fulfillment')
				.update({ define_roadmaps_done: true })
				.eq('user_id', user_id);
			dbStatus = stepError ? `saved, but step update error: ${stepError.message}` : 'saved and step updated';
			// Store the assistant message in the chat history if userMessage exists
			if (userMessage) {
				await insertChatMessage({ user_id, role: 'assistant', content: userMessage });
			}
		} else {
			dbStatus = `error: ${error.message}`;
		}
	}

	// 4. Return the AI's response, DB status, and readable roadmap info
	return new Response(JSON.stringify({
		status: 'ok',
		selectedRoadmap,
		dbStatus,
		userMessage,
		roadmap: roadmapInfo,
		roadmapSummary,
		previousMessagesCount: previousMessages.length
	}), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
