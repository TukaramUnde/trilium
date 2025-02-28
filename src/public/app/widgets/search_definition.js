import noteAutocompleteService from "../services/note_autocomplete.js";
import SpacedUpdate from "../services/spaced_update.js";
import server from "../services/server.js";
import TabAwareWidget from "./tab_aware_widget.js";
import treeCache from "../services/tree_cache.js";

const TPL = `
<div class="search-definition-widget">
    <style>
    .note-detail-search {
        padding: 7px;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .search-setting-table {
        margin-top: 7px;
        margin-bottom: 7px;
        width: 100%;
        border-collapse: separate;
        border-spacing: 10px;
    }
    
    .attribute-list hr {
        height: 1px;
        border-color: var(--main-border-color);
        position: relative;
        top: 4px;
        margin-top: 5px;
        margin-bottom: 0;
    }
    </style>

    <div class="search-settings">
        <table class="search-setting-table">
            <tr>
                <td>Search string:</td>
                <td colspan="3">
                    <input type="text" class="form-control search-string">
                </td>
                <td>
                    <div class="dropdown">
                      <button class="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        ?
                      </button>
                      <div class="dropdown-menu dropdown-menu-right p-4" style="width: 500px;">
                        <strong>Search tips</strong> - also see <button class="btn btn-sm" type="button" data-help-page="Search">complete help on search</button>
                        <p>
                        <ul>
                            <li>Just enter any text for full text search</li>
                            <li><code>#abc</code> - returns notes with label abc</li>
                            <li><code>#year = 2019</code> - matches notes with label <code>year</code> having value <code>2019</code></li>
                            <li><code>#rock #pop</code> - matches notes which have both <code>rock</code> and <code>pop</code> labels</li>
                            <li><code>#rock or #pop</code> - only one of the labels must be present</li>
                            <li><code>#year &lt;= 2000</code> - numerical comparison (also &gt;, &gt;=, &lt;).</li>
                            <li><code>note.dateCreated >= MONTH-1</code> - notes created in the last month</li>
                        </ul>
                        </p>
                    </div>
                </td>
            </tr>
            <tr>
                <td>Limit search to subtree:</td>
                <td>
                    <div class="input-group">
                        <input class="limit-search-to-subtree form-control" placeholder="search for note by its name">
                    </div>
                </td>
                <td colspan="2" style="padding-top: 9px;">
                    <label title="By choosing to take into acount also note content, search can be slightly slower">
                        <input class="search-within-note-content" value="1" type="checkbox" checked>
    
                        Search also within note content
                    </label>
                </td>
            </tr>
        </table>
    </div>
</div>`;

export default class SearchDefinitionWidget extends TabAwareWidget {
    static getType() { return "search"; }

    renderTitle(note) {
        return {
            show: note.type === 'search',
            activate: true,
            $title: 'Search'
        };
    }

    doRender() {
        this.$widget = $(TPL);
        this.contentSized();
        this.overflowing();
        this.$searchString = this.$widget.find(".search-string");
        this.$searchString.on('input', () => this.spacedUpdate.scheduleUpdate());

        this.$component = this.$widget.find('.search-definition-widget');

        this.spacedUpdate = new SpacedUpdate(() => this.updateSearch(), 2000);

        this.$limitSearchToSubtree = this.$widget.find('.limit-search-to-subtree');
        noteAutocompleteService.initNoteAutocomplete(this.$limitSearchToSubtree);

        this.$limitSearchToSubtree.on('autocomplete:closed', e => {
            this.spacedUpdate.scheduleUpdate();
        });

        this.$searchWithinNoteContent = this.$widget.find('.search-within-note-content');
        this.$searchWithinNoteContent.on('change', () => {
            this.spacedUpdate.scheduleUpdate();
        });
    }

    async updateSearch() {
        const searchString = this.$searchString.val();
        const subTreeNoteId = this.$limitSearchToSubtree.getSelectedNoteId();
        const includeNoteContent = this.$searchWithinNoteContent.is(":checked");

        await server.put(`notes/${this.noteId}/attributes`, [
            { type: 'label', name: 'searchString', value: searchString },
            { type: 'label', name: 'includeNoteContent', value: includeNoteContent ? 'true' : 'false' },
            subTreeNoteId ? { type: 'label', name: 'subTreeNoteId', value: subTreeNoteId } : undefined,
        ].filter(it => !!it));

        if (this.note.title.startsWith('Search: ')) {
            await server.put(`notes/${this.noteId}/change-title`, {
                title: 'Search: ' + (searchString.length < 30 ? searchString : `${searchString.substr(0, 30)}…`)
            });
        }

        await this.refreshResults();
    }

    async refreshResults() {
        await treeCache.reloadNotes([this.noteId]);
    }

    async refreshWithNote(note) {
        this.$component.show();
        this.$searchString.val(this.note.getLabelValue('searchString'));
        this.$searchWithinNoteContent.prop('checked', this.note.getLabelValue('includeNoteContent') === 'true');

        const subTreeNoteId = this.note.getLabelValue('subTreeNoteId');
        const subTreeNote = subTreeNoteId ? await treeCache.getNote(subTreeNoteId, true) : null;

        this.$limitSearchToSubtree
            .val(subTreeNote ? subTreeNote.title : "")
            .setSelectedNotePath(subTreeNoteId);

        this.refreshResults(); // important specifically when this search note was not yet refreshed
    }

    focusOnSearchDefinitionEvent() {
        this.$searchString.focus();
    }

    getContent() {
        return JSON.stringify({
            searchString: this.$searchString.val()
        });
    }
}
