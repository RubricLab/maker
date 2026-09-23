import { renderGridPng } from '../src/lib/png'

/** The data URL the moderation module sends for a grid, which identifies the grid in a stubbed request. */
export const imageUrl = (grid: string): string =>
	`data:image/png;base64,${Buffer.from(renderGridPng(grid)).toString('base64')}`

/** The image inside a Responses API request body. */
export const imageOf = (body: {
	input: { content: { image_url?: string; type: string }[] }[]
}): string => body.input[0]?.content.find(part => part.type === 'input_image')?.image_url ?? ''

/** A canned Responses API answer whose structured verdict is `{ hide }`; a refusal carries no verdict. */
export const openaiResponse = (hide: boolean, refusal = false) => {
	const text = JSON.stringify({ depicts: 'test', hide })
	return {
		id: 'resp_test',
		object: 'response',
		output: [
			{
				content: refusal
					? [{ refusal: 'No.', type: 'refusal' }]
					: [{ annotations: [], text, type: 'output_text' }],
				id: 'msg_test',
				role: 'assistant',
				status: 'completed',
				type: 'message'
			}
		],
		output_text: refusal ? '' : text,
		status: 'completed',
		usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
	}
}
