import { performance, PerformanceObserver } from 'perf_hooks'

import logger from '@wdio/logger'
import SauceLabs from 'saucelabs'

const SC_RELAY_DEPCRECATION_WARNING = [
    'The "scRelay" option is depcrecated and will be removed',
    'with the upcoming versions of @wdio/sauce-service. Please',
    'remove the option as tests should work identically without it.'
].join(' ')

const log = logger('@wdio/sauce-service')
export default class SauceLauncher {
    constructor (options, capabilities, config) {
        this.options = options
        this.api = new SauceLabs(config)
    }

    /**
     * modify config and launch sauce connect
     */
    async onPrepare (config, capabilities) {
        if (!this.options.sauceConnect) {
            return
        }

        const sauceConnectOpts = this.options.sauceConnectOpts || {}
        const sauceConnectTunnelIdentifier = (
            sauceConnectOpts.tunnelIdentifier ||
            /**
             * generate random identifier if not provided
             */
            `SC-tunnel-${Math.random().toString().slice(2)}`)

        this.sauceConnectOpts = {
            noAutodetect: true,
            tunnelIdentifier: sauceConnectTunnelIdentifier,
            ...sauceConnectOpts
        }

        let endpointConfigurations = {}
        if (this.options.scRelay) {
            log.warn(SC_RELAY_DEPCRECATION_WARNING)

            const scRelayPort = this.sauceConnectOpts.port || 4445
            this.sauceConnectOpts.sePort = scRelayPort
            endpointConfigurations = {
                protocol: 'http',
                hostname: 'localhost',
                port: scRelayPort
            }
        }

        if (Array.isArray(capabilities)) {
            for (const capability of capabilities) {
                if (!capability['sauce:options']) {
                    capability['sauce:options'] = {}
                }

                Object.assign(capability, endpointConfigurations)
                capability['sauce:options'].tunnelIdentifier = (
                    capability.tunnelIdentifier ||
                    capability['sauce:options'].tunnelIdentifier ||
                    sauceConnectTunnelIdentifier
                )
                delete capability.tunnelIdentifier
            }
        } else {
            for (const browserName of Object.keys(capabilities)) {
                if (!capabilities[browserName].capabilities['sauce:options']) {
                    capabilities[browserName].capabilities['sauce:options'] = {}
                }
                Object.assign(capabilities[browserName].capabilities, endpointConfigurations)
                capabilities[browserName].capabilities['sauce:options'].tunnelIdentifier = (
                    capabilities[browserName].capabilities.tunnelIdentifier ||
                    capabilities[browserName].capabilities['sauce:options'].tunnelIdentifier ||
                    sauceConnectTunnelIdentifier
                )
                delete capabilities[browserName].capabilities.tunnelIdentifier
            }
        }

        /**
         * measure SC boot time
         */
        const obs = new PerformanceObserver((list) => {
            const entry = list.getEntries()[0]
            log.info(`Sauce Connect successfully started after ${entry.duration}ms`)
        })
        obs.observe({ entryTypes: ['measure'], buffered: false })

        performance.mark('sauceConnectStart')
        this.sauceConnectProcess = await this.api.startSauceConnect(this.sauceConnectOpts)
        performance.mark('sauceConnectEnd')
        performance.measure('bootTime', 'sauceConnectStart', 'sauceConnectEnd')
    }

    /**
     * shut down sauce connect
     */
    onComplete () {
        if (!this.sauceConnectProcess) {
            return
        }

        return this.sauceConnectProcess.close()
    }
}
