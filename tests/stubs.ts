/** A canned Jev answer whose offensiveness is `p`, for tests that must never reach TypeSafe. */
export const jevResponse = (p: number) => ({
	answers: { offensive: { noul: p, type: 'noul' } },
	model: 'jev-test',
	usage: { input_tokens: 1, output_tokens: 0 }
})

/** Filled cells in a Jev request's drawing, which survives rotation and so identifies the grid. */
export const filledCells = (body: { state: { drawing: string[] } }): number =>
	body.state.drawing.join('').split('#').length - 1
