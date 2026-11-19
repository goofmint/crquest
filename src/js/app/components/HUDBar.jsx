import React from 'react';
import { withTranslation } from 'react-i18next';
import numeral from 'numeral';
import sharedListener from '../common/listener';
import { context, setContext, emitter } from '../common/context';
import rank from '../common/rank';
import CharacterAvatar from './CharacterAvatar';
import { showConfirm } from '../platform/dialog';

const DEF_TITLE = 'TerminalQuest';

class HUDBar extends React.Component {
  static contextType = context;

  state = {
    currentObjectiveTitle: DEF_TITLE,
    currentObjective: null,
    showFogOwlButton: false
  };

  componentDidMount() {
    // set up hotkeys after component mounts
    sharedListener.simple_combo('1', () => this.toggleMenu('inventory'));
    sharedListener.simple_combo('2', () => this.toggleMenu('journal'));
    sharedListener.simple_combo('3', () => this.toggleMenu('settings'));
    sharedListener.simple_combo('4', () => this.toggleMenu('help'));
    sharedListener.simple_combo('5', () => this.returnToFogOwl());

    // retain previous shortcuts since we still have content which mentions
    // these keyboard shortcuts, still want them to work.
    sharedListener.simple_combo('i', () => this.toggleMenu('inventory'));
    sharedListener.simple_combo('j', () => this.toggleMenu('journal'));
    sharedListener.simple_combo('o', () => this.toggleMenu('settings'));
    sharedListener.simple_combo('h', () => this.toggleMenu('help'));
    sharedListener.simple_combo('r', () => this.returnToFogOwl());

    emitter.on('contextUpdate:currentLevel', () => {
      if (this.context.currentLevel) {
        // If a level has been selected, update the status
        this.updateQuestStatus();
      }

      // TODO - consider a level.json property to specify whether or not the
      // Return to Fog Owl button should show for a given level
      this.setState({
        showFogOwlButton: this.context.currentLevel &&
          this.context.currentLevel.levelName !== 'fog_owl' &&
          this.context.currentLevel.levelName !== 'owls_nest'
      });
    });

    emitter.on('contextUpdate:questStatus', () => {
      this.updateQuestStatus();
    });
  }

  // Update quest title and description for current level
  updateQuestStatus() {
    const levelQuestStatus = this.context.questStatus?.[this.context.currentLevel?.levelName];
    
    this.setState({
      currentObjectiveTitle: levelQuestStatus ?
        levelQuestStatus.title : this.state.currentObjectiveTitle,
      currentObjective: levelQuestStatus ?
        levelQuestStatus.description : this.state.currentObjective
    });
  }

  // Handle menu navigation
  toggleMenu(name) {
    const current = this.context.currentMenu;

    // Toggle menu off if the same menu hotkey is pressed again
    if (!name || (current && current.name === name)) {
      setContext({ currentMenu: null });
    } else {
      setContext({ currentMenu: { name }});
    }
  }

  async returnToFogOwl() {
    // The async message box is not modal, so ignore repeated triggers while it is open
    if (this.confirmingFogOwl) {
      return;
    }
    if (!this.state.showFogOwlButton) {
      return;
    }
    this.confirmingFogOwl = true;
    let confirmed;
    try {
      confirmed = await showConfirm(this.props.t('ui.hud.returnConfirm'));
    } finally {
      this.confirmingFogOwl = false;
    }
    if (confirmed) {
      setContext({
        currentLevel: {
          levelName: 'fog_owl',
          playerEntryPoint: 'player_entry1',
        }
      });
    }
  }

  render() {
    const { t } = this.props;
    const playerRank = rank(
      Object.keys(this.context.completedObjectives).length,
      this.context.numObjectives
    );
    return (
      <div className="HUDBar">
        <section className="user" onClick={() => this.toggleMenu('inventory')}>
          <CharacterAvatar className="w3 h3 mr1" />
          <div>
            {this.context.settings.name}
            <p>
              {t('ui.hud.xp')} <span>{numeral(this.context.xp).format('0,0')}</span>&nbsp;
              {t('ui.hud.rank')} <span>
                {playerRank === 'None' ? t('ui.hud.noRank') : playerRank}
              </span>
            </p>
          </div>
        </section>
        <section className="buttons">
          <div className="relative" onClick={() => this.toggleMenu('inventory')}>
            <img src="images/app/hud_bar/inventory.png" alt={t('ui.hud.inventoryShortcut')} />
            <p>1</p>
            <span className="tooltip">{t('ui.menu.inventory')}</span>
          </div>
          <div className="relative" onClick={() => this.toggleMenu('journal')}>
            <img src="images/app/hud_bar/book.png" alt={t('ui.hud.journalShortcut')} />
            <p>2</p>
            <span className="tooltip">{t('ui.menu.journal')}</span>
          </div>
          <div className="relative" onClick={() => this.toggleMenu('settings')}>
            <img src="images/app/hud_bar/settings.png" alt={t('ui.hud.settingsShortcut')} />
            <p>3</p>
            <span className="tooltip">{t('ui.menu.settings')}</span>
          </div>
          <div className="relative" onClick={() => this.toggleMenu('help')}>
            <img src="images/app/hud_bar/help.png" alt={t('ui.hud.helpShortcut')} />
            <p>4</p>
            <span className="tooltip">{t('ui.menu.help')}</span>
          </div>

          {this.state.showFogOwlButton && (
            <section className="fogOwl" onClick={() => this.returnToFogOwl()}>
              <img src="images/app/fog_owl.gif" alt={t('ui.hud.returnShortcut')} />
              <p>5</p>
              <span className="tooltip">{t('ui.hud.return')}</span>
            </section>
          )}

        </section>
        <section
          className="currentObjective"
          onClick={() => this.toggleMenu('journal')}
        >
          <span className="objectiveHeader">
            {this.state.currentObjectiveTitle}
          </span>
          <span>
            {this.state.currentObjective ?? t('ui.hud.defaultObjective')}
          </span>
        </section>
      </div>
    );
  }
}

export default withTranslation(undefined)(HUDBar);
