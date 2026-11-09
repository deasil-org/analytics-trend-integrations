<?php
/**
 * Text the site's owner can copy into their privacy policy, offered on
 * Settings → Privacy. It says what the script sends, and nothing more.
 */

defined( 'ABSPATH' ) || exit;

function analyticstrend_add_privacy_text(): void {
	if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
		return;
	}
	$paragraphs = array(
		__( 'This site counts its visits with AnalyticsTrend. It sets no cookies.', 'analyticstrend' ),
		__( 'Your browser keeps a random identifier for this site in its own storage. It is not made from anything about you or your device, and it can’t be matched with any other site.', 'analyticstrend' ),
		__( 'With each page you view, AnalyticsTrend receives the page’s path, the site that linked you here (its name only), any campaign tags on the link you arrived from, and how long the page was visible. From your browser’s request it reads your country (in some countries your region), your browser, operating system and kind of device, and the language your browser asks for. Your IP address is used to find the country and is then discarded, never stored.', 'analyticstrend' ),
		__( 'If your browser sends Global Privacy Control, you are not counted.', 'analyticstrend' ),
	);
	if ( '1' === get_option( 'analyticstrend_link_events', '0' ) ) {
		array_splice( $paragraphs, 3, 0, __( 'It also receives the site’s name when you follow a link to another site, and the file’s name when you download one.', 'analyticstrend' ) );
	}
	$links = sprintf(
		/* translators: 1: link to the list of what AnalyticsTrend collects, 2: link to AnalyticsTrend's privacy policy. */
		__( 'AnalyticsTrend is run by Deasil. What it collects is listed in %1$s, and its privacy policy is at %2$s.', 'analyticstrend' ),
		'<a href="' . esc_url( analyticstrend_docs_url( 'guide/what-is-analyticstrend#what-it-collects' ) ) . '">' . esc_html__( 'its documentation', 'analyticstrend' ) . '</a>',
		'<a href="https://analyticstrend.com/privacy">https://analyticstrend.com/privacy</a>'
	);
	$text = '';
	foreach ( $paragraphs as $paragraph ) {
		$text .= '<p>' . esc_html( $paragraph ) . '</p>';
	}
	$text .= '<p>' . $links . '</p>';
	wp_add_privacy_policy_content( 'AnalyticsTrend', wp_kses_post( $text ) );
}
add_action( 'admin_init', 'analyticstrend_add_privacy_text' );
