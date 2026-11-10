<?php
/**
 * Prints the AnalyticsTrend script tag in every public page's head.
 *
 * The script ships inside the plugin and loads from the site itself: the
 * plugin makes no request of its own to any other server, and events reach
 * AnalyticsTrend only from the visitor's browser.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether this page view carries the tag: there is a key, and the person
 * viewing is not someone the site's owner asked to leave out.
 */
function analyticstrend_should_print_tag(): bool {
	if ( '' === (string) get_option( 'analyticstrend_write_key', '' ) ) {
		return false;
	}
	// Only people who can edit others' posts: administrators and editors.
	// A subscriber or a customer who signs in is a visitor like any other.
	if ( '1' === get_option( 'analyticstrend_skip_editors', '1' ) && current_user_can( 'edit_others_posts' ) ) {
		return false;
	}
	return true;
}

function analyticstrend_print_tag(): void {
	if ( ! analyticstrend_should_print_tag() ) {
		return;
	}
	$attributes = array(
		'src'            => add_query_arg( 'ver', ANALYTICSTREND_VERSION, plugins_url( 'assets/script.js', ANALYTICSTREND_FILE ) ),
		'defer'          => true,
		'data-write-key' => (string) get_option( 'analyticstrend_write_key', '' ),
	);
	if ( '1' === get_option( 'analyticstrend_link_events', '0' ) ) {
		$attributes['data-outbound-links'] = 'true';
		$attributes['data-file-downloads'] = 'true';
	}
	wp_print_script_tag( $attributes );
}
add_action( 'wp_head', 'analyticstrend_print_tag' );
