export function getTimestampHHMM(timestamp: any) {
    const date = new Date(timestamp)
    if (!Number.isNaN(date.getTime())) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    const value = String(timestamp || '')
    const match = value.match(/T(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : ''
}

export function isTimeInVisibilityRange(hhmm: any, start: any, end: any) {
    if (!hhmm) return false
    const from = start || null
    const to = end || null
    if (from && to) {
        if (from <= to) return hhmm >= from && hhmm <= to
        return hhmm >= from || hhmm <= to
    }
    if (from) return hhmm >= from
    if (to) return hhmm <= to
    return true
}

export function filterMessagesByVisibilityRange(messages: any[], start: any, end: any) {
    if (!start && !end) return messages
    return messages.filter((message: any) => isTimeInVisibilityRange(getTimestampHHMM(message.timestamp), start, end))
}
