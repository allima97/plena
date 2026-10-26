// Shared by Plena and NextGoals. A tour only opens local drafts; it never saves.
export function isTourismSection(section, types = []) {
  return !!section && (section.template?.id === 'tourism'
    || /\bturismo\b/i.test(section.name || '')
    || types.some(type => type.template?.id === 'tourism' && type.sectionId === section.id));
}

export function tourismTourSteps() {
  const step = (id, title, text, targets = [], panel = 'overview') => ({ id, title, text, targets, panel });
  return [
    step('welcome', 'Conheça sua seção de Turismo', 'Vamos percorrer as vendas de viagens, hotéis, cruzeiros e outros produtos. O tour abre as telas para explicar os campos, sem salvar alterações. Use Próximo e Voltar ou encerre quando quiser.'),
    step('section', 'Seu controle de Turismo', 'Esta seção reúne suas vendas, metas e comissões. Os números pertencem somente a este controle. O nome pode ser personalizado pelas opções da seção.', ['header']),
    step('month', 'Escolha o mês de referência', 'O mês selecionado define quais vendas, metas e comissões aparecem. Você pode consultar meses anteriores sem misturar os resultados. A data de cada venda determina em qual mês ela entra.', ['month']),
    step('plan', 'Meta mensal e supermeta', 'A meta é o total que você pretende vender no mês. A supermeta é um objetivo maior. Ambas acompanham o total bruto vendido, antes de descontar as taxas. A configuração vale para o mês selecionado.', ['plan-values'], 'plan'),
    step('base', 'Escolha a base da comissão', 'No bruto, a comissão usa o valor total da venda. No líquido, usa o total menos as taxas. Exemplo: venda de R$ 1.000,00 com R$ 100,00 de taxas tem base líquida de R$ 900,00. Essa escolha não muda o atingimento da meta, que usa o bruto.', ['commission-base'], 'plan'),
    step('types', 'Organize os tipos de venda', 'Cada produto tem seu próprio cadastro: por exemplo, Facial, Hotel, Cruzeiro e Seguro viagem. Cadastre ou edite os tipos que sua operação utiliza e confira as regras de comissão de cada um.', ['type-list', 'type-name'], 'types'),
    step('rates', 'Comissão em cada faixa da meta', 'Configure o percentual do produto para Meta não batida, Meta batida e Supermeta. A faixa depende do total bruto vendido no mês. Quando a faixa muda, as comissões das vendas desse mês são recalculadas.', ['type-rates'], 'type'),
    step('scaling', 'Comissão escalonável', 'Os passos antes e após a meta são opcionais. Exemplo: com comissão inicial de 0,80% e passo de 1%, 81% da meta pode gerar 0,81% de comissão. Em 100%, entra a taxa de Meta batida; os próximos passos respeitam o teto da Supermeta. Campos vazios mantêm as taxas fixas por faixa.', ['type-scaling', 'type-rates'], 'type'),
    step('specific', 'Meta própria de um produto', 'Em Possui meta específica?, escolha Sim para definir uma meta mensal e uma comissão própria, como no Seguro viagem. Ao atingir a meta do produto, entra apenas o complemento: se a taxa específica é 10% e a geral é 0,80%, o adicional é 9,20%, sem duplicar a comissão.', ['type-specific'], 'type'),
    step('gross', 'Total vendido: o valor bruto', 'Soma o valor total de todas as vendas do mês, antes das taxas. É este valor que movimenta a meta mensal, a supermeta e as faixas de comissão.', ['gross']),
    step('fees', 'Taxas das vendas', 'Soma as taxas informadas nas vendas do mês. Elas reduzem o líquido e, quando a comissão está configurada sobre o líquido, também reduzem sua base de cálculo.', ['fees']),
    step('net', 'Vendas líquidas', 'É o total vendido menos as taxas. Exemplo: R$ 10.000,00 vendidos menos R$ 1.000,00 em taxas resultam em R$ 9.000,00 líquidos. Este número é diferente do bruto usado na meta.', ['net']),
    step('monthly', 'Acompanhe a meta do mês', 'A barra compara o bruto vendido com a meta mensal. Ela muda de cor até chegar ao verde em 100%. O percentual e o valor que falta mostram o avanço. Se ainda não houver meta, cadastre-a em Metas mensais.', ['monthly-goal', 'plan-button']),
    step('super', 'Depois da meta, a supermeta', 'A supermeta só aparece no painel quando você alcança a meta mensal. Ela acompanha o mesmo total bruto e permite continuar medindo seu desempenho acima de 100% da meta inicial.', ['super-goal', 'monthly-goal', 'plan-button']),
    step('product-goal', 'Metas por tipo de venda', 'Quando um tipo tem meta específica, esta área compara as vendas brutas daquele produto com sua própria meta. Atingir a meta do produto pode liberar o complemento mesmo antes de bater a meta geral.', ['product-goal', 'types-button']),
    step('pace', 'Quanto vender por dia', 'No mês atual, este indicador divide o que falta para a meta pelos dias restantes, incluindo hoje. O aviso de ritmo compara o desempenho até agora com o necessário para chegar à meta. Meses passados não mostram esse indicador.', ['daily', 'month']),
    step('commission', 'Comissão geral das vendas', 'Soma a comissão geral de cada venda, usando a taxa do tipo na faixa alcançada e a base bruta ou líquida escolhida. Se aparecer A configurar, confira os percentuais em Tipos de venda.', ['commission', 'types-button']),
    step('product-commission', 'Complemento do produto', 'Quando a meta específica é alcançada, o cartão do produto mostra somente o adicional à comissão geral. Antes disso, o complemento é zero. O cálculo usa a mesma base bruta ou líquida definida para a comissão.', ['product-commission', 'commission', 'types-button']),
    step('commission-total', 'Vendas + produtos', 'Quando há complemento de produto, este cartão reúne a comissão geral e os complementos. Ele mostra o total final da comissão do mês; não é o total vendido.', ['commission-total', 'commission', 'types-button']),
    step('distribution', 'Participação de cada produto', 'Veja quais tipos mais contribuem para o bruto vendido. A lista vai da maior participação para a menor. Ela aparece quando há vendas no mês.', ['distribution', 'gross']),
    step('new-sale', 'Cadastre uma venda de Turismo', 'Em Nova venda, informe a data e escolha o tipo correto. O número do pedido é opcional e ajuda a localizar o registro depois. Cada venda pertence a esta seção e ao mês da sua data.', ['sale-details'], 'sale'),
    step('sale-values', 'Informe o total e as taxas', 'Total é o valor bruto da venda. Taxas são os descontos dessa venda e não podem superar o total. Os campos formatam enquanto você digita: 3 vira 3,00 e 3000 vira 3.000,00. Use a vírgula para os centavos. Ao terminar o cadastro, Salvar ou Registrar venda atualiza o painel.', ['sale-values'], 'sale'),
    step('filters', 'Encontre uma venda', 'Filtre pelo tipo ou busque por pedido, tipo, data ou valor. Limpar filtros volta a mostrar todas as vendas. A busca altera somente a lista, sem mudar a meta ou as comissões calculadas para o mês inteiro.', ['filters']),
    step('pages', 'Resultados e páginas', 'Resultados informa quantas vendas correspondem à busca no mês. A linha exibindo indica o intervalo da página. Use Anterior e Próxima para navegar; cada página mostra até 15 vendas.', ['results']),
    step('ledger', 'Confira e corrija os registros', 'Cada venda mostra pedido, data, tipo, bruto, taxas, líquido, percentual e valor total da comissão. O lápis abre a edição. A exclusão pede confirmação e recalcula os resultados. No celular, os dados ficam em cartões.', ['sale-row', 'ledger']),
    step('reports', 'Compare trimestre, semestre e ano', 'Em Relatórios, selecione o ano e o período para comparar seu desempenho. Todo o histórico reúne os meses registrados. Consultar o relatório não altera suas vendas ou metas.', ['report-filters'], 'reports'),
    step('history', 'Leia seu desempenho mês a mês', 'Cada mês mostra vendido, meta, percentual e status. O resumo do período usa a soma das metas e das vendas dos meses com meta, sem fazer uma média simples dos percentuais. Meses sem meta são identificados; meses futuros ficam fora do resumo.', ['report-month', 'report-summary'], 'reports'),
    step('finish', 'O tour fica sempre disponível', 'Você já conhece a operação de Turismo. Abra Tour de ajuda nesta seção sempre que precisar rever os campos e os cálculos. Ao concluir, os formulários usados no tour serão fechados sem salvar.', ['help'])
  ];
}

export function startTourismTour({ theme, prepare, onClose, returnFocus }) {
  const steps = tourismTourSteps(), originalFocus = document.activeElement;
  const originalScroll = { left: window.scrollX, top: window.scrollY };
  const root = document.createElement('div');
  root.className = `tourism-walkthrough tourism-${theme}`;
  root.innerHTML = '<div class="tourism-tour-spot" hidden></div><section class="tourism-tour-card" role="dialog" aria-modal="true" aria-labelledby="tourism-tour-title" aria-describedby="tourism-tour-text"><div class="tourism-tour-top"><p class="tourism-tour-count" aria-live="polite"></p><button type="button" class="tourism-tour-close" aria-label="Encerrar tour">×</button></div><h2 id="tourism-tour-title" tabindex="-1"></h2><p id="tourism-tour-text"></p><div class="tourism-tour-nav"><button type="button" data-tourism-nav="close">Sair do tour</button><div><button type="button" data-tourism-nav="back">Voltar</button><button type="button" data-tourism-nav="next">Próximo</button></div></div></section>';
  document.body.append(root);
  const inerted = [...document.body.children].filter(el => el !== root && !el.inert);
  inerted.forEach(el => { el.inert = true; });
  const card = root.querySelector('.tourism-tour-card'), spot = root.querySelector('.tourism-tour-spot');
  const title = root.querySelector('h2'), text = root.querySelector('#tourism-tour-text');
  const back = root.querySelector('[data-tourism-nav="back"]'), next = root.querySelector('[data-tourism-nav="next"]');
  let index = 0, closed = false, loading = false, frame = 0, generation = 0, target = null;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  function findTarget(keys) {
    for (const key of keys) {
      for (const el of document.querySelectorAll(`[data-tourism="${key}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && getComputedStyle(el).visibility !== 'hidden') return el;
      }
    }
    return null;
  }
  function position() {
    if (closed) return;
    const width = window.innerWidth, height = window.innerHeight, gap = 12;
    const r = target?.isConnected ? target.getBoundingClientRect() : null;
    const usable = r && r.bottom > 0 && r.top < height && r.right > 0 && r.left < width;
    spot.hidden = !usable;
    root.toggleAttribute('data-unfocused', !usable);
    if (usable) {
      Object.assign(spot.style, { top: `${Math.max(4, r.top - 6)}px`, left: `${Math.max(4, r.left - 6)}px`, width: `${Math.min(width - 8, r.right + 6) - Math.max(4, r.left - 6)}px`, height: `${Math.min(height - 4, r.bottom + 6) - Math.max(4, r.top - 6)}px` });
    }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = (width - cw) / 2, top = (height - ch) / 2;
    if (usable) {
      if (r.bottom + gap + ch <= height - gap) top = r.bottom + gap;
      else if (r.top - gap - ch >= gap) top = r.top - gap - ch;
      else if (r.right + gap + cw <= width - gap) { left = r.right + gap; top = r.top; }
      else if (r.left - gap - cw >= gap) { left = r.left - gap - cw; top = r.top; }
      else top = height - ch - gap;
      if (left === (width - cw) / 2) left = Math.max(gap, Math.min(r.left, width - cw - gap));
    }
    card.style.left = `${Math.max(gap, Math.min(left, width - cw - gap))}px`;
    card.style.top = `${Math.max(gap, Math.min(top, height - ch - gap))}px`;
  }
  function reposition() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  }
  async function show(nextIndex) {
    if (closed || loading || nextIndex < 0) return;
    if (nextIndex >= steps.length) { close(); return; }
    index = nextIndex; loading = true; back.disabled = next.disabled = true;
    const current = ++generation, step = steps[index];
    try {
      await prepare(step);
      if (closed || current !== generation) return;
      root.dataset.step = step.id;
      root.querySelector('.tourism-tour-count').textContent = `Turismo · Passo ${index + 1} de ${steps.length}`;
      title.textContent = step.title; text.textContent = step.text;
      back.hidden = index === 0; next.textContent = index === steps.length - 1 ? 'Concluir' : 'Próximo';
      target = findTarget(step.targets);
      target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await nextFrame();
      if (closed || current !== generation) return;
      position(); title.focus({ preventScroll: true });
    } catch (error) {
      close();
      throw error;
    } finally {
      loading = false; back.disabled = next.disabled = false;
    }
  }
  async function close() {
    if (closed) return;
    closed = true; generation++; cancelAnimationFrame(frame);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', keyDown, true);
    root.remove(); inerted.forEach(el => { if (el.isConnected) el.inert = false; });
    await onClose?.();
    window.scrollTo({ ...originalScroll, behavior: 'instant' });
    (returnFocus?.() || (originalFocus?.isConnected ? originalFocus : null))?.focus({ preventScroll: true });
  }
  function keyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      const buttons = [...card.querySelectorAll('button')].filter(el => !el.disabled && !el.hidden);
      const first = buttons[0], last = buttons.at(-1);
      if (!card.contains(document.activeElement) || document.activeElement === title || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
      event.stopImmediatePropagation();
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('tourism-tour-close') || button.dataset.tourismNav === 'close') close();
    else if (button.dataset.tourismNav === 'back') show(index - 1);
    else if (button.dataset.tourismNav === 'next') show(index + 1);
  });
  document.addEventListener('keydown', keyDown, true);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  show(0);
  return { close };
}
