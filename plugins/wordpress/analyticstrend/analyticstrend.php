<?php
/**
 * Plugin Name:       AnalyticsTrend
 * Plugin URI:        https://analyticstrend.com
 * Description:       Product analytics for your site, with no cookies and no personal data. Paste your write key and every page is counted.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            Deasil
 * Author URI:        https://analyticstrend.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       analyticstrend
 * Domain Path:       /languages
 */

defined( 'ABSPATH' ) || exit;

define( 'ANALYTICSTREND_VERSION', '1.0.0' );
define( 'ANALYTICSTREND_FILE', __FILE__ );

require_once __DIR__ . '/includes/settings.php';
require_once __DIR__ . '/includes/tag.php';
