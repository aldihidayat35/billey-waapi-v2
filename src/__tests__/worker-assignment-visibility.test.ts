const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Script, createContext } = require('node:vm')

function extractFunction(source, name) {
	const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`))
	if (!match) throw new Error(`Function ${name} not found`)
	return match[0]
}

function loadVisibilityRangeModule() {
	const file = resolve(process.cwd(), 'visibility-range.ts')
	const source = readFileSync(file, 'utf8')
	const sandbox = { module: { exports: {} }, exports: {} }
	const executable = source
		.replace(/export function /g, 'function ')
		.concat('\nmodule.exports = { getTimestampHHMM, isTimeInVisibilityRange, filterMessagesByVisibilityRange }\n')
	new Script(executable, { filename: file }).runInContext(createContext(sandbox))
	return sandbox.module.exports
}

describe('worker assignment visibility', () => {
	it('prevents the visibility toggle label from toggling the checkbox twice', () => {
		const source = readFileSync(resolve(process.cwd(), 'public/admin/penugasan.html'), 'utf8')
		const functions = [
			extractFunction(source, 'handleUnlimitedToggle'),
			extractFunction(source, 'toggleVisLimit'),
		].join('\n')

		let preventDefaultCalled = false
		const checkbox = {
			checked: true,
			dataset: { key: 'wautama|6283197544429@s.whatsapp.net' },
			dispatchEvent(event) {
				sandbox.toggleVisLimit(this)
			},
		}
		const start = { disabled: true, value: '' }
		const end = { disabled: true, value: '' }
		const labelClasses = new Set(['checked'])
		const label = {
			querySelector: () => checkbox,
			classList: {
				toggle(name, force) {
					if (force) labelClasses.add(name)
					else labelClasses.delete(name)
				},
				contains(name) {
					return labelClasses.has(name)
				},
			},
		}
		const row = {
			querySelectorAll(selector) {
				if (selector === '.cnr-vis-start') return [start]
				if (selector === '.cnr-vis-end') return [end]
				return []
			},
			querySelector(selector) {
				if (selector === '.cnr-unlimited-toggle') return label
				return null
			},
		}
		checkbox.closest = () => row
		const sandbox = {
			contactNotesMap: {
				'wautama|6283197544429@s.whatsapp.net': { no_visibility_limit: true },
			},
			Event,
		}
		new Script(functions).runInContext(createContext(sandbox))

		sandbox.handleUnlimitedToggle(label, {
			target: { tagName: 'SPAN' },
			preventDefault() {
				preventDefaultCalled = true
			},
		})

		expect(preventDefaultCalled).toBe(true)
		expect(checkbox.checked).toBe(false)
		expect(start.disabled).toBe(false)
		expect(end.disabled).toBe(false)
		expect(label.classList.contains('checked')).toBe(false)
		expect(sandbox.contactNotesMap['wautama|6283197544429@s.whatsapp.net'].no_visibility_limit).toBe(false)
	})

	it('keeps only messages inside normal and overnight visibility ranges', async () => {
		const visibility = loadVisibilityRangeModule()

		const messages = [
			{ id: 'before', timestamp: '2026-06-08T08:59:00' },
			{ id: 'start', timestamp: '2026-06-08T09:00:00' },
			{ id: 'inside', timestamp: '2026-06-08T12:30:00' },
			{ id: 'end', timestamp: '2026-06-08T17:00:00' },
			{ id: 'after', timestamp: '2026-06-08T17:01:00' },
		]
		expect(visibility.filterMessagesByVisibilityRange(messages, '09:00', '17:00').map(m => m.id))
			.toEqual(['start', 'inside', 'end'])

		const overnight = [
			{ id: 'evening-before', timestamp: '2026-06-08T21:59:00' },
			{ id: 'night-start', timestamp: '2026-06-08T22:00:00' },
			{ id: 'midnight', timestamp: '2026-06-09T00:30:00' },
			{ id: 'night-end', timestamp: '2026-06-09T02:00:00' },
			{ id: 'morning-after', timestamp: '2026-06-09T02:01:00' },
		]
		expect(visibility.filterMessagesByVisibilityRange(overnight, '22:00', '02:00').map(m => m.id))
			.toEqual(['night-start', 'midnight', 'night-end'])
	})
})
