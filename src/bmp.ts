import { DebugProtocol } from '@vscode/debugprotocol';
import { ConfigurationArguments, GDBServerController, SWOConfigureEvent, genDownloadCommands, getGDBSWOInitCommands } from './common';
import * as os from 'os';
import { EventEmitter } from 'events';

export class BMPServerController extends EventEmitter implements GDBServerController {
    public readonly name: string = 'BMP';
    public readonly portsNeeded: string[] = [];

    private args: ConfigurationArguments;
    private ports: { [name: string]: number };

    constructor() {
        super();
    }

    public setPorts(ports: { [name: string]: number }): void {
        this.ports = ports;
    }

    public setArguments(args: ConfigurationArguments): void {
        this.args = args;
    }

    public customRequest(command: string, response: DebugProtocol.Response, args: any): boolean {
        return false;
    }

    public initCommands(): string[] {
        const commands: string[] = [
            `target-select extended-remote ${this.args.BMPGDBSerialPort}`
        ];

        if (this.args.powerOverBMP === 'enable') {
            commands.push('interpreter-exec console "monitor tpwr enable"');
            // sleep for 100 ms. MCU need some time to boot up after power up
            commands.push('interpreter-exec console "shell sleep 0.1"');
        } else if (this.args.powerOverBMP === 'disable') {
            commands.push('interpreter-exec console "monitor tpwr disable"');
        } else {
            // keep last power state (do nothing)
        }

        if (this.args.interface === 'jtag') {       // TODO: handle ctag in when this server supports it
            commands.push('interpreter-exec console "monitor jtag_scan"');
        } else {
            commands.push('interpreter-exec console "monitor swdp_scan"');
        }

        commands.push(
            `interpreter-exec console "attach ${this.args.targetId}"`,
            'interpreter-exec console "set mem inaccessible-by-default off"'
        );

        return commands;
    }

    public launchCommands(): string[] {
        const commands = [
            ...genDownloadCommands(this.args, []),
            'interpreter-exec console "SoftwareReset 1"'
        ];
        return commands;
    }

    public attachCommands(): string[] {
        const commands: string[] = [];
        return commands;
    }

    public resetCommands(): string[] {
        const commands: string[] = [
            'interpreter-exec console "SoftwareReset"'
        ];
        return commands;
    }

    public swoAndRTTCommands(): string[] {
        const commands: string[] = [];
        if (this.args.swoConfig.enabled) {
            const swocommands = this.SWOConfigurationCommands();
            commands.push(...swocommands);
        }
        return commands;
    }

    private SWOConfigurationCommands(): string[] {
        const commands = getGDBSWOInitCommands(this.args.swoConfig);
        const swoFrequency = this.args.swoConfig.swoFrequency;
        const encoding = this.args.swoConfig.swoEncoding === 'manchester' ? 1 : 2;

        if (this.args.swoConfig.source === 'probe') {
            commands.push(encoding === 2 ? `monitor traceswo ${swoFrequency}` : 'monitor traceswo');
        }

        return commands.map((c) => `interpreter-exec console "${c}"`);
    }

    public serverExecutable(): string {
        return null;
    }

    public allocateRTTPorts(): Promise<void> {
        return Promise.resolve();
    }

    public serverArguments(): string[] {
        return [];
    }

    public initMatch(): RegExp {
        return null;
    }

    public serverLaunchStarted(): void {}
    public serverLaunchCompleted(): void {
        if (this.args.swoConfig.enabled) {
            if (this.args.swoConfig.source === 'probe') {
                this.emit('event', new SWOConfigureEvent({
                    type: 'usb',
                    args: this.args,
                    device: this.args.swoConfig.swoPath || 'Black Magic Probe',
                    port: this.args.swoConfig.swoPort || 'Black Magic Trace Capture'
                }));
            } else {
                this.emit('event', new SWOConfigureEvent({
                    type: 'serial',
                    args: this.args,
                    device: this.args.swoConfig.source,
                    baudRate: this.args.swoConfig.swoFrequency
                }));
            }
        }
    }

    public debuggerLaunchStarted(): void {}
    public debuggerLaunchCompleted(): void {}
}
