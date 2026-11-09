<?php
/**
 * The plugin's own translations, and links to the AnalyticsTrend docs in the
 * language the admin reads WordPress in.
 */

defined( 'ABSPATH' ) || exit;

function analyticstrend_load_textdomain(): void {
	unload_textdomain( 'analyticstrend' );
	load_plugin_textdomain( 'analyticstrend', false, dirname( plugin_basename( ANALYTICSTREND_FILE ) ) . '/languages' );
}
add_action( 'init', 'analyticstrend_load_textdomain' );

/**
 * A page of the AnalyticsTrend docs: in French, Spanish, Portuguese or German
 * when WordPress is shown in one of them, and in English otherwise.
 */
function analyticstrend_docs_url( string $page = 'guide/install-wordpress' ): string {
	$language = strtolower( substr( determine_locale(), 0, 2 ) );
	$prefix   = in_array( $language, array( 'fr', 'es', 'pt', 'de' ), true ) ? $language . '/' : '';
	return 'https://analyticstrend.com/docs/' . $prefix . $page;
}

/** Settings and Docs, on the plugin's row in Plugins. */
function analyticstrend_action_links( array $links ): array {
	$settings = sprintf( '<a href="%s">%s</a>', esc_url( admin_url( 'options-general.php?page=analyticstrend' ) ), esc_html__( 'Settings', 'analyticstrend' ) );
	$docs     = sprintf( '<a href="%s">%s</a>', esc_url( analyticstrend_docs_url() ), esc_html__( 'Docs', 'analyticstrend' ) );
	array_unshift( $links, $settings, $docs );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( ANALYTICSTREND_FILE ), 'analyticstrend_action_links' );
