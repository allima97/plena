<script>
 import { tick } from 'svelte';
 import { t } from '$lib/i18n.js';
 import Modal from './Modal.svelte';
 let { open, name, email, onClose } = $props();
 let closeButton = $state(null);
 $effect(() => { if (open) tick().then(() => closeButton?.focus()); });
 function trapFocus(event) {
  if (!open || event.key !== 'Tab' || !closeButton) return;
  const controls = [...closeButton.closest('[role="dialog"]').querySelectorAll('button:not(:disabled)')];
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
 }
</script>
<svelte:window onkeydown={trapFocus} />
<Modal {open} {onClose} title={t('profile_title')} maxWidth="420px">
 <dl class="user-profile-details">
  <div><dt>{t('profile_name')}</dt><dd>{name?.trim() || t('profile_unavailable')}</dd></div>
  <div><dt>{t('profile_email')}</dt><dd>{email || t('profile_unavailable')}</dd></div>
 </dl>
 {#snippet footer()}<button class="btn btn-primary" bind:this={closeButton} onclick={onClose}>{t('profile_close')}</button>{/snippet}
</Modal>
<style>
 .user-profile-details { display:grid; gap:20px; margin:0; }
 dt { color:var(--ink-muted); font-size:12px; font-weight:600; }
 dd { margin:5px 0 0; color:var(--ink); font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
</style>
