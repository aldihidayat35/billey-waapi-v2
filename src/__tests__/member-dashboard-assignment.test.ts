const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Script, createContext } = require('node:vm')

function deferred() {
	let resolveFn
	let rejectFn
	const promise = new Promise((resolve, reject) => {
		resolveFn = resolve
		rejectFn = reject
	})
	return { promise, resolve: resolveFn, reject: rejectFn }
}

function loadAssignmentPanelFactory() {
	const file = resolve(process.cwd(), 'public/member/assignment-panel.js')
	const source = readFileSync(file, 'utf8')
	const sandbox = {
		window: {},
		console,
		setTimeout,
		clearTimeout,
		AbortController,
	}
	sandbox.window.window = sandbox.window
	new Script(source, { filename: file }).runInContext(createContext(sandbox))
	return sandbox.window.MemberAssignmentPanel.createAssignmentPanelController
}

describe('member dashboard assignment panel controller', () => {
	it('does not call a missing worker assignment helper in the contact detail route', () => {
		const source = readFileSync(resolve(process.cwd(), 'web-server.ts'), 'utf8')
		const routeStart = source.indexOf("app.get('/api/member/contact-detail/:sessionId/:contact'")
		expect(routeStart).toBeGreaterThan(-1)
		const routeEnd = source.indexOf('// Forward a message from member dashboard', routeStart)
		const routeSource = source.slice(routeStart, routeEnd)

		expect(routeSource).not.toContain('workerAssignmentDb.getByContact')
	})

	it('does not hide assigned worker names for future scheduled assignments', () => {
		const source = readFileSync(resolve(process.cwd(), 'web-server.ts'), 'utf8')
		const detailStart = source.indexOf("app.get('/api/member/contact-detail/:sessionId/:contact'")
		const detailEnd = source.indexOf('const assignmentInfoRaw', detailStart)
		const detailWorkerQuery = source.slice(detailStart, detailEnd)
		const conversationStart = source.indexOf('const assignedWorkers = db.prepare(`')
		const conversationEnd = source.indexOf('const contactNameRow', conversationStart)
		const conversationWorkerQuery = source.slice(conversationStart, conversationEnd)

		expect(detailWorkerQuery).not.toContain('wa.start_datetime <= datetime')
		expect(detailWorkerQuery).not.toContain('wa.end_datetime >= datetime')
		expect(conversationWorkerQuery).not.toContain('wa.start_datetime <= datetime')
		expect(conversationWorkerQuery).not.toContain('wa.end_datetime >= datetime')
	})

	it('ignores stale assignment responses when active chat changes quickly', async () => {
		const createController = loadAssignmentPanelFactory()
		let active = { sessionId: 'session-a', contact: '111@s.whatsapp.net' }
		const first = deferred()
		const second = deferred()
		const renders = []
		const controller = createController({
			getActiveChat: () => active,
			fetchDetail: (sessionId, contact) => {
				if (sessionId === 'session-a' && contact === '111@s.whatsapp.net') return first.promise
				if (sessionId === 'session-a' && contact === '222@s.whatsapp.net') return second.promise
				throw new Error('unexpected request')
			},
			renderLoading: chat => renders.push(`loading:${chat.contact}`),
			renderDetail: detail => renders.push(`detail:${detail.contact}`),
			renderEmpty: chat => renders.push(`empty:${chat.contact}`),
			renderError: chat => renders.push(`error:${chat.contact}`),
			onAssignment: () => {},
		})

		const requestA = controller.load(active)
		active = { sessionId: 'session-a', contact: '222@s.whatsapp.net' }
		const requestB = controller.load(active)

		second.resolve({
			success: true,
			contact: '222@s.whatsapp.net',
			assignedWorkers: ['Worker B'],
			assignment: { notes: 'B', priority: 'high' },
		})
		await requestB

		first.resolve({
			success: true,
			contact: '111@s.whatsapp.net',
			assignedWorkers: ['Worker A'],
			assignment: { notes: 'A', priority: 'low' },
		})
		await requestA

		expect(renders).toEqual([
			'loading:111@s.whatsapp.net',
			'loading:222@s.whatsapp.net',
			'detail:222@s.whatsapp.net',
		])
	})

	it('renders fallback assignment data when the detail endpoint fails', async () => {
		const createController = loadAssignmentPanelFactory()
		const active = { sessionId: 'wautama', contact: '6283197544429@s.whatsapp.net' }
		const renders = []
		const controller = createController({
			getActiveChat: () => active,
			fetchDetail: () => Promise.reject(new Error('backend detail failed')),
			getFallbackDetail: () => ({
				success: true,
				sessionId: active.sessionId,
				contact: active.contact,
				assignedWorkers: ['aldi'],
				assignment: { notes: 'adadad', priority: 'low' },
			}),
			renderLoading: chat => renders.push(`loading:${chat.contact}`),
			renderDetail: detail => renders.push(`detail:${detail.contact}:${detail.assignment.notes}:${detail.assignedWorkers[0]}`),
			renderEmpty: chat => renders.push(`empty:${chat.contact}`),
			renderError: chat => renders.push(`error:${chat.contact}`),
			onAssignment: () => {},
		})

		await controller.load(active)

		expect(renders).toEqual([
			'loading:6283197544429@s.whatsapp.net',
			'detail:6283197544429@s.whatsapp.net:adadad:aldi',
		])
	})
})
