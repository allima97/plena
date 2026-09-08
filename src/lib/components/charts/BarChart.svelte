<script>
	/**
	 * Gráfico de barras agrupadas (2 séries), sem dependências, em SVG puro.
	 * data: [{ label, a, b, current }]
	 */
	let { data = [], height = 210, colorA = '#b5ead0', colorAActive = '#4dcc8c', colorB = '#fac7c0', colorBActive = '#f18c7e' } = $props();

	const barW = 8;
	const gap = 5;
	const groupGap = 14;
	const groupW = barW * 2 + gap;
	const padTop = 10;
	const padBottom = 22;
	const plotH = $derived(height - padTop - padBottom);
	const width = $derived(Math.max(1, data.length) * (groupW + groupGap) + groupGap);
	const max = $derived(Math.max(1, ...data.flatMap((d) => [d.a || 0, d.b || 0])));
</script>

<svg viewBox="0 0 {width} {height}" style="width:100%;height:{height}px;display:block" preserveAspectRatio="none">
	{#each data as d, i (d.label + i)}
		{@const x = groupGap + i * (groupW + groupGap)}
		{@const hA = ((d.a || 0) / max) * plotH}
		{@const hB = ((d.b || 0) / max) * plotH}
		<rect x={x} y={padTop + plotH - hA} width={barW} height={Math.max(hA, 1.5)} rx="3" fill={d.current ? colorAActive : colorA} />
		<rect x={x + barW + gap} y={padTop + plotH - hB} width={barW} height={Math.max(hB, 1.5)} rx="3" fill={d.current ? colorBActive : colorB} />
		<text x={x + barW + gap / 2} y={height - 6} font-size="9" fill="var(--ink-faint)" text-anchor="middle" font-family="inherit">{d.label}</text>
	{/each}
</svg>
