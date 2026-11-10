<?php
/**
 * Settings → AnalyticsTrend: the write key and two choices.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The pasted key, trimmed, if it is a write key; '' otherwise. Spaces, line
 * breaks and the invisible characters copying can bring along are dropped
 * from both ends first.
 */
function analyticstrend_sanitize_key( $raw ): string {
	$key = preg_replace( '/^[\s\x{00A0}\x{200B}\x{FEFF}]+|[\s\x{00A0}\x{200B}\x{FEFF}]+$/u', '', (string) $raw );
	return is_string( $key ) && preg_match( '/^wk_[0-9a-f]{32}$/', $key ) ? $key : '';
}

/**
 * What is saved: the key, '' when the field was emptied, or the key already
 * saved when what was pasted isn't one, so a slip doesn't stop the counting.
 */
function analyticstrend_save_key( $raw ): string {
	$key = analyticstrend_sanitize_key( $raw );
	if ( '' !== $key || '' === trim( (string) $raw ) ) {
		return $key;
	}
	// WordPress runs a setting's sanitizer twice the first time it is saved.
	if ( function_exists( 'add_settings_error' ) && ! in_array( 'invalid_key', wp_list_pluck( get_settings_errors( 'analyticstrend_write_key' ), 'code' ), true ) ) {
		add_settings_error(
			'analyticstrend_write_key',
			'invalid_key',
			__( 'That isn’t a website’s write key, so the key already saved was kept. Copy it from your project’s setup page in AnalyticsTrend: it starts with wk_ followed by 32 letters and numbers.', 'analyticstrend' )
		);
	}
	return (string) get_option( 'analyticstrend_write_key', '' );
}

function analyticstrend_sanitize_flag( $value ): string {
	return empty( $value ) ? '0' : '1';
}

function analyticstrend_register_settings(): void {
	register_setting(
		'analyticstrend',
		'analyticstrend_write_key',
		array(
			'type'              => 'string',
			'default'           => '',
			'sanitize_callback' => 'analyticstrend_save_key',
		)
	);
	register_setting(
		'analyticstrend',
		'analyticstrend_skip_editors',
		array(
			'type'              => 'string',
			'default'           => '1',
			'sanitize_callback' => 'analyticstrend_sanitize_flag',
		)
	);
	register_setting(
		'analyticstrend',
		'analyticstrend_link_events',
		array(
			'type'              => 'string',
			'default'           => '0',
			'sanitize_callback' => 'analyticstrend_sanitize_flag',
		)
	);
}
// On init rather than admin_init, so a key saved any other way (WP-CLI,
// another plugin) is checked the same way.
add_action( 'init', 'analyticstrend_register_settings' );

function analyticstrend_add_settings_page(): void {
	add_options_page( 'AnalyticsTrend', 'AnalyticsTrend', 'manage_options', 'analyticstrend', 'analyticstrend_settings_page' );
}
add_action( 'admin_menu', 'analyticstrend_add_settings_page' );

function analyticstrend_settings_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key          = (string) get_option( 'analyticstrend_write_key', '' );
	$skip_editors = '1' === get_option( 'analyticstrend_skip_editors', '1' );
	$link_events  = '1' === get_option( 'analyticstrend_link_events', '0' );
	?>
	<div class="wrap">
		<h1>AnalyticsTrend</h1>
		<form action="options.php" method="post">
			<?php settings_fields( 'analyticstrend' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="analyticstrend_write_key"><?php esc_html_e( 'Write key', 'analyticstrend' ); ?></label></th>
					<td>
						<input type="text" class="regular-text code" id="analyticstrend_write_key" name="analyticstrend_write_key" value="<?php echo esc_attr( $key ); ?>" placeholder="wk_…" autocomplete="off" spellcheck="false" />
						<p class="description"><?php esc_html_e( 'Paste the write key from your project’s setup page in AnalyticsTrend.', 'analyticstrend' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Who is counted', 'analyticstrend' ); ?></th>
					<td>
						<label><input type="checkbox" name="analyticstrend_skip_editors" value="1" <?php checked( $skip_editors ); ?> /> <?php esc_html_e( 'Don’t count logged-in administrators and editors', 'analyticstrend' ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Links', 'analyticstrend' ); ?></th>
					<td>
						<label><input type="checkbox" name="analyticstrend_link_events" value="1" <?php checked( $link_events ); ?> /> <?php esc_html_e( 'Count clicks on links to other sites, and file downloads', 'analyticstrend' ); ?></label>
					</td>
				</tr>
			</table>
			<p><?php esc_html_e( 'The script ships inside this plugin and loads from your own site. It sets no cookies.', 'analyticstrend' ); ?></p>
			<?php submit_button(); ?>
		</form>
		<p>
			<a href="<?php echo esc_url( analyticstrend_docs_url() ); ?>"><?php esc_html_e( 'How to install, leave yourself out and check it works', 'analyticstrend' ); ?></a>
			·
			<a href="https://analyticstrend.com/projects"><?php esc_html_e( 'Your projects in AnalyticsTrend', 'analyticstrend' ); ?></a>
		</p>
	</div>
	<?php
}
