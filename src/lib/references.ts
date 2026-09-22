// Reference drawings Jev compares a submission with, stored as packed bits and decoded on load into rows of
// "#" (filled) and "." (empty), exactly how submissions are sent. Sizes and styles vary on purpose so Jev
// judges the picture rather than the pixels. Keep tests/drawings.ts distinct from these.

const decode = (size: number, data: string): string[] => {
	const bytes = Buffer.from(data, 'base64')
	return Array.from({ length: size }, (_, y) =>
		Array.from({ length: size }, (_, x) => {
			const index = y * size + x
			return ((bytes[index >> 3] ?? 0) >> (7 - (index & 7))) & 1 ? '#' : '.'
		}).join('')
	)
}

// biome-ignore assist/source/useSortedKeys: Jev reads the state in order; this is the calibrated order.
export const OFFENSIVE = {
	swastika: [
		decode(8, 'AE5ISH4KegA='),
		decode(10, 'ABHkQRBEH+BIEnyAAA=='),
		decode(11, 'AA35vzYH/P+DMGZ8z5gAAA=='),
		decode(13, 'AAIfkICEBCAhAf/AQgIQEICE/CAAAA=='),
		decode(14, 'AAGP5j+YwGMBjAf/n/4DGAxgMZ/GfxgAAA=='),
		decode(16, 'AAAAADH8MfwxgDGAMYA//D/8AYwBjAGMP4w/jAAAAAA='),
		decode(17, 'AAAAAA5/hz/Dn+HOAOcAf/w//h//AHOAOcP84f5w/zgAAAAAAA=='),
		decode(19, 'AAAAAADD/hh/wwwAYYAMMAGGAD//h//wAwYAYMAMGAGDADBh/gw/wYAAAAAAAA=='),
		decode(
			24,
			'AAAAAAAAAAAAHB/4HB/4HB/4HBwAHBwAHBwAHBwAHBwAH//4H//4H//4ABw4ABw4ABw4ABw4H/w4H/w4H/w4AAAAAAAAAAAA'
		),
		decode(10, 'AB4giCIIn+SBIE+AAA==')
	],
	penis: [
		decode(5, 'I5zqgA=='),
		decode(7, 'EHDhw42xgA=='),
		decode(10, 'DAeB4DAMAwDBtvPYYA=='),
		decode(11, 'BAHAOAIAQAgBACBk3r2DAA=='),
		decode(14, 'AwAeAHgAwAMADAAwAMADAO3Ht54eOHAAAA=='),
		decode(10, 'QDgOAQY/z/QbgOAQAA=='),
		decode(20, 'APAADwAD/AA/wAP8AD/AAPAADwAA8AAPAADwAA8AAPAADwA888PPPP8P//D/PAPDwDw=')
	],
	ss_bolts: [decode(9, 'EJCQnvEJCQkIAAA='), decode(13, 'DBjBjBjBj9/+/DBjBjBjBjBgAAAAAA==')],
	noose: [decode(9, 'CAQCA4HBEQSCPgA='), decode(13, 'AgAQAIAOAHADgGMEBCAhAQQQHwAAAA==')]
}

export const HARMLESS = {
	heart: decode(7, 'ANv/98cEAA=='),
	letter_T: decode(7, '/iBAgQIEAA=='),
	tree: decode(7, 'EHH38QIAAA==')
}
