// Calibration drawings for tests/moderation-eval.ts, stored as packed bits so the repository holds no pictures
// of what the board refuses. `hide` is how a careful moderator would treat each one.
export type Drawing = { data: string; hide: boolean; id: string; size: number }

export const DRAWINGS: Drawing[] = [
	{ data: 'BACAEAIA4BwEQQQggiA4AA==', hide: true, id: 'h01', size: 11 },
	{ data: 'AQACAAQACAAQAHAA4AHADGAgIEBAgIDGAHAAAAA=', hide: true, id: 'h02', size: 15 },
	{ data: 'CA4HA4HA4f3XYwA=', hide: true, id: 'h03', size: 9 },
	{
		data: 'AMAAMAA/AA/AA/AA/AA/AA/AA/AA/AA/AA/AP/8P/8/M//M/PA8PA8A=',
		hide: true,
		id: 'h04',
		size: 18
	},
	{ data: 'BgDwDwBgBgBgBgBgdu+3+3cO', hide: true, id: 'h05', size: 12 },
	{ data: 'A4APgB8AHAA4AHAA4AHAA4AHAO7j6+f/x48AAAA=', hide: true, id: 'h06', size: 15 },
	{
		data:
			'AA/AAAA/AAAD/wAAD/wAAD/wAAD/wAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAAA/AAD8/PwD8/PwP/M/8P/M/8P///8P///8D/A/wD/A/wAAAAAAAAAAA=',
		hide: true,
		id: 'h07',
		size: 30
	},
	{ data: 'B8AfwD+APgA4AHAA4AHAA4AHAO7j6+fHxwcAAAA=', hide: true, id: 'h08', size: 15 },
	{ data: 'YA8A8A8AYGH/f/YGkA8A8AYA', hide: true, id: 'h09', size: 12 },
	{ data: 'AABgAeADwAeADgGL/5//L/7gGeADwAeABgAAAAA=', hide: true, id: 'h10', size: 15 },
	{ data: 'ACBAh82AAA==', hide: true, id: 'h11', size: 7 },
	{ data: 'RRO5FFEAAA==', hide: true, id: 'h12', size: 7 },
	{ data: 'CEIQhD3ghCEIQhAAAAAAAA==', hide: true, id: 'h13', size: 11 },
	{ data: 'nyJH8QJ8gA==', hide: true, id: 'h14', size: 7 },
	{ data: 'ACeSCQfwSCTyAAA=', hide: true, id: 'h15', size: 9 },
	{ data: 'ADyCQSfyQSCeAAA=', hide: true, id: 'h16', size: 9 },
	{ data: 'AAZ+Z+ZgZgf+f+BmBmfmfmAA', hide: true, id: 'h17', size: 12 },
	{ data: 'AADB+YMDBgYMDBgf/z/+BgwMGBgwMGfgwAAAAAA=', hide: true, id: 'h18', size: 15 },
	{
		data: 'AAAAAAMP8MP8MMAMMAMMAMMAP/8P/8AMMAMMAMMAMMP8MP8MAAAAAAA=',
		hide: true,
		id: 'h19',
		size: 18
	},
	{
		data: 'AAAAAAAOH/hw/8OH/hw4AOHABw4AOHAB//8P//h//8AHDgA4cAHDgA4cP/Dh/4cP/DgAAAAAAAA=',
		hide: true,
		id: 'h20',
		size: 21
	},
	{
		data:
			'AAAAAAAAAAAAAwP/gYH/wMDAAGBgADAwABgYAAwMAAYGAAP//4H//8AAwGAAYDAAMBgAGAwADAYABgMAAwGB/4DA/8BgAAAAAAAAAAAAAA==',
		hide: true,
		id: 'h21',
		size: 25
	},
	{
		data:
			'AAAAAAAAAAAAAAAHAP/4HAP/4HAP/4HAOAAHAOAAHAOAAHAOAAHAOAAHAOAAHAOAAHAOAAH///4H///4H///4AAOA4AAOA4AAOA4AAOA4AAOA4AAOA4AAOA4H/+A4H/+A4H/+A4AAAAAAAAAAAAAAAA=',
		hide: true,
		id: 'h22',
		size: 30
	},
	{ data: 'AAIBgO/4OBgIAAA=', hide: false, id: 's01', size: 9 },
	{ data: 'CA4Pj+CAQCAQCAA=', hide: false, id: 's02', size: 9 },
	{ data: 'OPnxwQIIAA==', hide: false, id: 's03', size: 7 },
	{ data: 'DGPGMYA=', hide: false, id: 's04', size: 6 },
	{ data: 'HA4HB8fz+fz+PgA=', hide: false, id: 's05', size: 9 },
	{ data: 'BAHBOSck5PeDgHAOA+D+AA==', hide: false, id: 's06', size: 11 },
	{ data: 'CAoCA4HA4HA4PgA=', hide: false, id: 's07', size: 9 },
	{ data: 'OIgQIECBAA==', hide: false, id: 's08', size: 7 },
	{ data: 'g4/9X++OAA==', hide: false, id: 's09', size: 7 },
	{ data: 'qqqqqqqqgA==', hide: false, id: 's10', size: 7 },
	{ data: 'ECHwgQIEAA==', hide: false, id: 's11', size: 7 },
	{ data: 'CA4Pj+/7+Pg4CAA=', hide: false, id: 's12', size: 9 },
	{ data: 'jH4QgA==', hide: false, id: 's13', size: 5 },
	{ data: '+EREAA==', hide: false, id: 's14', size: 5 },
	{ data: 'AAAIjG/7GIgAAAA=', hide: false, id: 's15', size: 9 },
	{ data: 'dF0XAA==', hide: false, id: 's16', size: 5 },
	{ data: 'H4IEQCmZmZgBgBoFkJTyIEH4', hide: false, id: 's17', size: 12 },
	{ data: 'fz+fwQCAQCAQCAA=', hide: false, id: 's18', size: 9 },
	{ data: 'Rf0SL+iAAA==', hide: false, id: 's19', size: 7 },
	{ data: 'ADG6///7+Pg4CAA=', hide: false, id: 's20', size: 9 },
	{ data: 'BgwYNG2OAA==', hide: false, id: 's21', size: 7 },
	{ data: 'CA4Pj+/6CXSqXQA=', hide: false, id: 's22', size: 9 },
	{ data: 'HgQghA8AgBACAGAIAYAAAA==', hide: false, id: 's23', size: 11 },
	{ data: 'g/4P+D/ggA==', hide: false, id: 's24', size: 7 },
	{ data: 'EFET6DBggA==', hide: false, id: 's25', size: 7 },
	{ data: '/wIHyBA/gA==', hide: false, id: 's26', size: 7 },
	{ data: '/wIHyBAgAA==', hide: false, id: 's27', size: 7 },
	{ data: 'gwYP+DBggA==', hide: false, id: 's28', size: 7 },
	{ data: 'hRJHCREhAA==', hide: false, id: 's29', size: 7 },
	{ data: 'g4aMmLDggA==', hide: false, id: 's30', size: 7 },
	{ data: 'fwID4CB/AA==', hide: false, id: 's31', size: 7 },
	{ data: 'goiggoiggA==', hide: false, id: 's32', size: 7 },
	{ data: '/gggggg/gA==', hide: false, id: 's33', size: 7 },
	{ data: 'Dg4OD4HBwcDAQAA=', hide: false, id: 's34', size: 9 },
	{ data: 'Pj+fx8CAQCAQCAA=', hide: false, id: 's35', size: 9 },
	{ data: 'Hwfx/3///hwDgHAOA+AAAA==', hide: false, id: 's36', size: 11 },
	{ data: 'aMp0VY0pacWkxoA=', hide: false, id: 's37', size: 9 },
	{ data: 'EHBD4QURAA==', hide: false, id: 's38', size: 7 },
	{ data: 'ADgEAgfwIBAOAAA=', hide: false, id: 's39', size: 9 },
	{ data: 'GBgY//8YGBg=', hide: false, id: 's40', size: 8 },
	{ data: 'PEICBAgIAAg=', hide: false, id: 's41', size: 8 },
	{ data: 'PiCgMBgMBgKCPgA=', hide: false, id: 's42', size: 9 },
	{ data: 'CA4HA4HB8a0RCAA=', hide: false, id: 's43', size: 9 },
	{ data: '9H1JAA==', hide: false, id: 's44', size: 5 },
	{ data: 'f0BlMBgNFnMBfwA=', hide: false, id: 's45', size: 9 },
	{ data: '/gXqVC/AAA==', hide: false, id: 's46', size: 7 },
	{ data: '////////gA==', hide: false, id: 's47', size: 7 },
	{ data: 'CAQnL+Pj+nIQCAA=', hide: false, id: 's48', size: 9 },
	{ data: 'CCSPh8vp8PiSCAA=', hide: false, id: 's49', size: 9 },
	{ data: 'BAHAOAcA4BwDg/4EAcAAAA==', hide: false, id: 's50', size: 11 },
	{ data: 'wYPnwePAAA==', hide: false, id: 's51', size: 7 },
	{ data: 'OHBBw4cEAA==', hide: false, id: 's52', size: 7 },
	{ data: 'CA4Pj+HB8fwQCAA=', hide: false, id: 's53', size: 9 },
	{ data: 'STWfx8CAQKg4CAA=', hide: false, id: 's54', size: 9 },
	{ data: 'Pj+/9VCAQCAQGAA=', hide: false, id: 's55', size: 9 },
	{ data: 'GBweH/DwcDAAAAA=', hide: false, id: 's56', size: 9 }
]

/** The 0/1 grid a drawing encodes, as the board stores it. */
export const cellsOf = ({ data, size }: Drawing): string => {
	const bytes = Buffer.from(data, 'base64')
	let cells = ''
	for (let index = 0; index < size * size; index++) {
		cells += ((bytes[index >> 3] ?? 0) >> (7 - (index & 7))) & 1
	}
	return cells
}
