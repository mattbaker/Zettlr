/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        ZettlrIPC class
 * CVM-Role:        Controller
 * Maintainer:      Hendrik Erz
 * License:         MIT
 *
 * Description:     This class is basically the postmaster of the app.
 *
 * END HEADER
 */

const {trans} = require('../common/lang/i18n.js');

/**
 * This class acts as the interface between the main process and the renderer.
 * It receives messages from the renderer and dispatches them to their appropriate
 * addressees, as well as send commands after a small sanity check (such that
 * the content is never empty)
 */
class ZettlrIPC
{
    /**
     * Create the ipc
     * @param {Zettlr} zettlrObj The application main object
     */
    constructor(zettlrObj)
    {
        this._app = zettlrObj;
        this._ipc = require('electron').ipcMain;

        // Beginn listening to messages
        this._ipc.on('message', (event, arg) => {
            // Omit the event right now
            this.dispatch(arg);
        });
    }

    /**
     * This function gets called every time the renderer sends a message.
     * @param  {Object} arg   The message's body
     * @return {void}       Does not return anything.
     */
    dispatch(arg)
    {
        // handleEvent expects arg to contain at least 'command' and 'content'
        // properties
        if(!arg.hasOwnProperty('command')) {
            console.error(trans('system.no_command'), arg);
            return;
        }
        if(!arg.hasOwnProperty('content')) {
            arg.content = {};
        }
        this.handleEvent(arg.command, arg.content);
    }

    /**
     * This sends a message to the current window's renderer process.
     * @param  {String} command The command to be sent
     * @param  {Mixed} content Can be either simply a string or a whole object
     * @return {ZettlrIPC}         This for chainability.
     */
    /**
     * This sends a message to the current window's renderer process.
     * @param  {String} command      The command to be sent
     * @param  {Object} [content={}] Can be either simply a string or a whole object
     * @return {ZettlrIPC}              This for chainability.
     */
    send(command, content = {})
    {
        let sender = this._app.window.getWindow().webContents;
        sender.send('message', {
            'command': command,
            'content': content
        });

        return this;
    }

    /**
     * This function switches through the received command and issues function
     * calls to the zettlr object according to the events.
     * @param {String} cmd The command to be handled
     * @param  {Object} cnt   Contains the message body.
     * @return {void}       Does not return anything.
     */
    handleEvent(cmd, cnt)
    {
        // We received a new event and need to handle it.
        switch(cmd) {
            case 'get-paths':
            // The child process requested the current paths and files
            this.send('paths', this._app.getPaths());
            break;

            case 'file-get-quicklook':
            this.send('file-quicklook', this._app.getPaths().findFile({'hash': cnt}).withContent());
            break;

            case 'file-get':
            // The client requested a different file.
            this._app.sendFile(cnt);
            break;

            case 'dir-select':
            // The client requested another directory
            this._app.selectDir(cnt);
            break;

            case 'file-modified':
            // Just set the modification flags.
            this._app.setModified();
            break;

            case 'file-new':
            // Client has requested a new file.
            this._app.newFile(cnt);
            break;

            case 'dir-new':
            // Client has requested a new folder.
            this._app.newDir(cnt);
            break;

            case 'file-save':
            // Client has requested a save-action.
            // arg contains the contents of CM and maybe also a hash.
            this._app.saveFile(cnt);
            break;

            case 'file-autosave':
            this._app.autoSave(cnt);
            break;

            case 'file-revert':
            this._app.revert();
            break;

            case 'dir-open':
            // Client requested a totally different folder.
            this._app.openDir();
            break;

            case 'file-delete':
            if(cnt.hasOwnProperty('hash')) {
                this._app.removeFile(cnt.hash);
            } else if(this._app.getCurrentFile() != null) {
                this._app.removeFile();
            }
            break;

            case 'dir-delete':
            if(cnt.hasOwnProperty('hash')) {
                this._app.removeDir(cnt.hash);
            } else if(this._app.getCurrentDir() != null) {
                this._app.removeDir();
            }
            break;

            case 'file-search':
            // arg.content contains a hash of the file to be searched
            // and the prepared terms.
            let ret = this._app.getPaths().findFile({ 'hash': cnt.hash }).search(cnt.terms);
            this.send('file-search-result', {
                'hash'  : cnt.hash,
                'result': ret
            });
            break;

            // Change theme in config
            case 'toggle-theme':
            this._app.getConfig().set('darkTheme', !this._app.getConfig().get('darkTheme'));
            break;

            // Change snippet setting in config
            case 'toggle-snippets':
            this._app.getConfig().set('snippets', !this._app.getConfig().get('snippets'));
            break;

            case 'export':
            this._app.exportFile(cnt);
            break;

            // Rename a directory (arg.hash + arg.(new)name)
            case 'dir-rename':
            this._app.renameDir(cnt);
            break;

            case 'file-rename':
            this._app.renameFile(cnt);
            break;

            // Client requested a directory move
            case 'request-move':
            this._app.requestMove(cnt);
            break;

            case 'get-preferences':
            // Duplicate the object because we only need supportedLangs for the
            // renderer
            let toSend = JSON.parse(JSON.stringify(this._app.getConfig().getConfig()));
            toSend.supportedLangs = this._app.getConfig().getSupportedLangs();
            this.send('preferences', toSend);
            break;

            // Got a new config object
            case 'update-config':
            // Immediately reflect snippets and theme
            if(cnt.darkTheme != this._app.getConfig().get('darkTheme')) {
                this.send('toggle-theme', 'no-emit');
            }
            if(cnt.snippets != this._app.getConfig().get('snippets')) {
                this.send('toggle-snippets', 'no-emit');
            }
            this._app.getConfig().update(cnt);
            break;

            // Renderer wants a configuration value
            case 'config-get':
            this.send('config', { 'key': cnt, 'value': this._app.getConfig().get(cnt) });
            break;

            case 'config-get-env':
            this.send('config', { 'key': cnt, 'value': this._app.getConfig().getEnv(cnt) });
            break;

            // SPELLCHECKING EVENTS
            case 'typo-request-lang':
            this.send('typo-lang', this._app.getConfig().get('spellcheck'));
            break;

            case 'typo-request-aff':
            this._app.retrieveDictFile('aff', cnt);
            break;

            case 'typo-request-dic':
            this._app.retrieveDictFile('dic', cnt);
            break;

            default:
            console.log(trans('system.unknown_command', cmd));
            break;
        }
    }
}

module.exports = ZettlrIPC;
