export function compactPath(value: string): string {
	const separator = value.includes("\\") ? "\\" : "/";
	const segments = value.split(/[\\/]+/).filter(Boolean);
	if (segments.length <= 3) return value;

	const hasDrive = /^[a-z]:[\\/]/i.test(value);
	const prefix = hasDrive ? `${segments[0]}${separator}` : "";
	return `${prefix}…${separator}${segments.slice(-2).join(separator)}`;
}
