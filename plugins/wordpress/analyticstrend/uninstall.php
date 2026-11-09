<?php
/**
 * Deleting the plugin deletes its settings.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'analyticstrend_write_key' );
delete_option( 'analyticstrend_skip_editors' );
delete_option( 'analyticstrend_link_events' );
