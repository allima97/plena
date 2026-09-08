<script>
	/**
	 * Donut simples em SVG puro (stroke-dasharray por segmento).
	 * slices: [{ label, value, color }]
	 */
	let { slices = [], size = 148, thickness = 22, centerLabel = '', centerValue = '' } = $props();

	const total = $derived(slices.reduce((s, x) => s + (x.value || 0), 0) || 1);
	const r = $derived((size - thickness) / 2);
	const circumference = $derived(2 * Math.PI * r);
	const segs = $derived.by(() => {
		let acc = 0;
		return slices.map((s) => {
			const frac = (s.value || 0) / total;
			const seg = { ...s, dash: frac * circumference, offset: acc * circumference };
			acc += frac;
			return seg;
		});
	});
</script>

<div style="position:relative;width:{size}px;height:{size}px">
	<svg width={size} height={size} viewBox="0 0 {size} {size}">
		<circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" stroke-width={thickness} />
		{#each segs as s (s.label)}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke={s.color}
				stroke-width={thickness}
				stroke-dasharray="{s.dash} {circumference - s.dash}"
				stroke-dashoffset={-s.offset}
				transform="rotate(-90 {size / 2} {size / 2})"
			/>
		{/each}
	</svg>
	<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 8px">
		<span style="font-size:9.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.08em;font-weight:800">{centerLabel}</span>
		<span class="font-display privacy-value" style="font-size:14px;font-weight:700;margin-top:3px">{centerValue}</span>
	</div>
</div>
