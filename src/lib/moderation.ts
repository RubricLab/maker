import OpenAI from 'openai'
import { renderGridPng } from './png'

const MODEL = 'gpt-6-sol'
const PROMPT = `This pixel drawing was submitted to a public shared board. Say what it depicts, then decide whether to hide it.

Hide only clearly offensive drawings: hate symbols such as swastikas or SS bolts, genitalia or sex acts, nooses, slurs, or gore. Crude pixel genitalia is common here and is often tiny: a shaft with two rounded or square lobes at its base is a penis, not an anchor, rocket, candle, or mushroom. A long blade with a crossguard and a short grip below it is a sword, not genitalia. Two parallel lightning-bolt S shapes side by side are SS bolts. Show everything else, including abstract shapes, letters, faces, animals, objects, random noise, and rude but harmless gestures.`
const FORMAT = {
	name: 'verdict',
	schema: {
		additionalProperties: false,
		properties: { depicts: { type: 'string' }, hide: { type: 'boolean' } },
		required: ['depicts', 'hide'],
		type: 'object'
	},
	strict: true,
	type: 'json_schema'
} as const

export type Verdict = { depicts: string; hide: boolean }

/** Shows the rendered grid to the model. Throws when the request fails or comes back without a verdict. */
export const verdict = async (grid: string, effort: 'low' | 'medium' = 'low'): Promise<Verdict> => {
	const image = `data:image/png;base64,${Buffer.from(renderGridPng(grid)).toString('base64')}`
	const response = await new OpenAI().responses.create({
		input: [
			{
				content: [
					{ detail: 'low', image_url: image, type: 'input_image' },
					{ text: PROMPT, type: 'input_text' }
				],
				role: 'user'
			}
		],
		max_output_tokens: 2048,
		model: MODEL,
		reasoning: { effort },
		text: { format: FORMAT }
	})
	if (response.status !== 'completed' || !response.output_text) {
		throw new Error(
			`Moderation ${response.status}: ${response.incomplete_details?.reason ?? 'no verdict'}`
		)
	}
	return JSON.parse(response.output_text) as Verdict
}

/** Whether a grid is too offensive for the public board. Fails closed: a missing key or a failed request hides it. */
export const shouldHide = async (grid: string): Promise<boolean> => {
	if (!process.env.OPENAI_API_KEY) {
		console.error('OPENAI_API_KEY is not set; hiding creation')
		return true
	}
	try {
		return (await verdict(grid)).hide
	} catch (error) {
		console.error('Moderation failed; hiding creation', error)
		return true
	}
}
