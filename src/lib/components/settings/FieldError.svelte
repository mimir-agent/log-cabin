<!--
@component
A field's error, after Campsite's TextField (CC BY-NC 4.0): red, behind a 2px red rule, 8px
under the control. Point the control's `aria-describedby` at `id`.
-->
<script lang="ts">
	type Props = { id: string; message: string };

	let { id, message }: Props = $props();
</script>

<p class="error" {id}>{message}</p>

<style>
	.error {
		margin: var(--gap-sm) 0 0;
		padding-inline-start: var(--gap-md);
		border-inline-start: 2px solid currentColor;
		color: var(--hue-danger);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}
</style>
