const subManager = new SubsManager();

BlazeComponent.extendComponent({
  mixins() {
    return [Mixins.InfiniteScrolling, Mixins.PerfectScrollbar];
  },

  calculateNextPeak() {
    const cardElement = this.find('.js-card-details');
    if (cardElement) {
      const altitude = cardElement.scrollHeight;
      this.callFirstWith(this, 'setNextPeak', altitude);
    }
  },

  reachNextPeak() {
    const activitiesComponent = this.childComponents('activities')[0];
    activitiesComponent.loadNextPage();
  },

  onCreated() {
    this.isLoaded = new ReactiveVar(false);
    this.parentComponent().parentComponent().showOverlay.set(true);
    this.parentComponent().parentComponent().mouseHasEnterCardDetails = false;
    this.calculateNextPeak();

    Meteor.subscribe('unsaved-edits');
  },

  isWatching() {
    const card = this.currentData();
    return card.findWatcher(Meteor.userId());
  },

  hiddenSystemMessages() {
    return Meteor.user().hasHiddenSystemMessages();
  },

  canModifyCard() {
    return Meteor.user() && Meteor.user().isBoardMember() && !Meteor.user().isCommentOnly();
  },

  scrollParentContainer() {
    const cardPanelWidth = 510;
    const bodyBoardComponent = this.parentComponent().parentComponent();

    const $cardContainer = bodyBoardComponent.$('.js-lists');
    const $cardView = this.$(this.firstNode());
    const cardContainerScroll = $cardContainer.scrollLeft();
    const cardContainerWidth = $cardContainer.width();

    const cardViewStart = $cardView.offset().left;
    const cardViewEnd = cardViewStart + cardPanelWidth;

    let offset = false;
    if (cardViewStart < 0) {
      offset = cardViewStart;
    } else if (cardViewEnd > cardContainerWidth) {
      offset = cardViewEnd - cardContainerWidth;
    }

    if (offset) {
      bodyBoardComponent.scrollLeft(cardContainerScroll + offset);
    }
  },

  onRendered() {
    if (!Utils.isMiniScreen()) this.scrollParentContainer();
  },

  onDestroyed() {
    this.parentComponent().parentComponent().showOverlay.set(false);
  },

  events() {
    const events = {
      [`${CSSEvents.transitionend} .js-card-details`]() {
        this.isLoaded.set(true);
      },
      [`${CSSEvents.animationend} .js-card-details`]() {
        this.isLoaded.set(true);
      },
    };

    return [{
      ...events,
      'click .js-close-card-details' () {
        Utils.goBoardId(this.data().boardId);
      },
      'click .js-open-card-details-menu': Popup.open('cardDetailsActions'),
      'submit .js-card-description' (evt) {
        evt.preventDefault();
        const description = this.currentComponent().getValue();
        this.data().setDescription(description);
      },
      'submit .js-card-details-title' (evt) {
        evt.preventDefault();
        const title = this.currentComponent().getValue().trim();
        if (title) {
          this.data().setTitle(title);
        }
      },
      'click .js-member': Popup.open('cardMember'),
      'click .js-add-members': Popup.open('cardMembers'),
      'click .js-add-labels': Popup.open('cardLabels'),
      'mouseenter .js-card-details' () {
        this.parentComponent().parentComponent().showOverlay.set(true);
        this.parentComponent().parentComponent().mouseHasEnterCardDetails = true;
      },
      'click #toggleButton'() {
        Meteor.call('toggleSystemMessages');
      },
    }];
  },
}).register('cardDetails');

// We extends the normal InlinedForm component to support UnsavedEdits draft
// feature.
(class extends InlinedForm {
  _getUnsavedEditKey() {
    return {
      fieldName: 'cardDescription',
      // XXX Recovering the currentCard identifier form a session variable is
      // fragile because this variable may change for instance if the route
      // change. We should use some component props instead.
      docId: Session.get('currentCard'),
    };
  }

  close(isReset = false) {
    if (this.isOpen.get() && !isReset) {
      const draft = this.getValue().trim();
      if (draft !== Cards.findOne(Session.get('currentCard')).description) {
        UnsavedEdits.set(this._getUnsavedEditKey(), this.getValue());
      }
    }
    super.close();
  }

  reset() {
    UnsavedEdits.reset(this._getUnsavedEditKey());
    this.close(true);
  }

  events() {
    const parentEvents = InlinedForm.prototype.events()[0];
    return [{
      ...parentEvents,
      'click .js-close-inlined-form': this.reset,
    }];
  }
}).register('inlinedCardDescription');

Template.cardDetailsActionsPopup.helpers({
  isWatching() {
    return this.findWatcher(Meteor.userId());
  },

  canModifyCard() {
    return Meteor.user() && Meteor.user().isBoardMember() && !Meteor.user().isCommentOnly();
  },
});

Template.cardDetailsActionsPopup.events({
  'click .js-members': Popup.open('cardMembers'),
  'click .js-labels': Popup.open('cardLabels'),
  'click .js-attachments': Popup.open('cardAttachments'),
  'click .js-start-date': Popup.open('editCardStartDate'),
  'click .js-due-date': Popup.open('editCardDueDate'),
  'click .js-spent-time': Popup.open('editCardSpentTime'),
  'click .js-move-card': Popup.open('moveCard'),
  'click .js-copy-card': Popup.open('copyCard'),
  'click .js-copy-checklist-cards': Popup.open('copyChecklistToManyCards'),
  'click .js-move-card-to-top' (evt) {
    evt.preventDefault();
    const minOrder = _.min(this.list().cards(this.swimlaneId).map((c) => c.sort));
    this.move(this.swimlaneId, this.listId, minOrder - 1);
  },
  'click .js-move-card-to-bottom' (evt) {
    evt.preventDefault();
    const maxOrder = _.max(this.list().cards(this.swimlaneId).map((c) => c.sort));
    this.move(this.swimlaneId, this.listId, maxOrder + 1);
  },
  'click .js-archive' (evt) {
    evt.preventDefault();
    this.archive();
    Popup.close();
  },
  'click .js-more': Popup.open('cardMore'),
  'click .js-toggle-watch-card' () {
    const currentCard = this;
    const level = currentCard.findWatcher(Meteor.userId()) ? null : 'watching';
    Meteor.call('watch', 'card', currentCard._id, level, (err, ret) => {
      if (!err && ret) Popup.close();
    });
  },
});

Template.editCardTitleForm.onRendered(function () {
  autosize(this.$('.js-edit-card-title'));
});

Template.editCardTitleForm.events({
  'keydown .js-edit-card-title' (evt) {
    // If enter key was pressed, submit the data
    // Unless the shift key is also being pressed
    if (evt.keyCode === 13 && !evt.shiftKey) {
      $('.js-submit-edit-card-title-form').click();
    }
  },
});

Template.moveCardPopup.events({
  'click .js-select-list' () {
    // XXX We should *not* get the currentCard from the global state, but
    // instead from a “component” state.
    const card = Cards.findOne(Session.get('currentCard'));
    const newListId = this._id;
    card.move(card.swimlaneId, newListId, 0);
    Popup.close();
  },
});

BlazeComponent.extendComponent({
  onCreated() {
    this.selectedBoard = new ReactiveVar(Session.get('currentBoard'));
  },

  boards() {
    const boards = Boards.find({
      archived: false,
      'members.userId': Meteor.userId(),
    }, {
      sort: ['title'],
    });
    return boards;
  },

  aBoardLists() {
    subManager.subscribe('board', this.selectedBoard.get());
    const board = Boards.findOne(this.selectedBoard.get());
    return board.lists();
  },
  events() {
    return [{
      'change .js-select-boards'(evt) {
        this.selectedBoard.set($(evt.currentTarget).val());
      },
    }];
  },
}).register('boardsAndLists');

Template.copyCardPopup.events({
  'click .js-select-list' (evt) {
    const card = Cards.findOne(Session.get('currentCard'));
    const oldId = card._id;
    card._id = null;
    card.listId = this._id;
    const list = Lists.findOne(card.listId);
    card.boardId = list.boardId;
    const textarea = $(evt.currentTarget).parents('.content').find('textarea');
    const title = textarea.val().trim();
    // insert new card to the bottom of new list
    card.sort = Lists.findOne(this._id).cards().count();

    if (title) {
      card.title = title;
      card.coverId = '';
      const _id = Cards.insert(card);
      // In case the filter is active we need to add the newly inserted card in
      // the list of exceptions -- cards that are not filtered. Otherwise the
      // card will disappear instantly.
      // See https://github.com/wekan/wekan/issues/80
      Filter.addException(_id);

      // copy checklists
      let cursor = Checklists.find({cardId: oldId});
      cursor.forEach(function() {
        'use strict';
        const checklist = arguments[0];
        checklist.cardId = _id;
        checklist._id = null;
        Checklists.insert(checklist);
      });

      // copy card comments
      cursor = CardComments.find({cardId: oldId});
      cursor.forEach(function () {
        'use strict';
        const comment = arguments[0];
        comment.cardId = _id;
        comment._id = null;
        CardComments.insert(comment);
      });
      Popup.close();
    }
  },
});


Template.copyChecklistToManyCardsPopup.events({
  'click .js-select-list' (evt) {
    const card = Cards.findOne(Session.get('currentCard'));
    const oldId = card._id;
    card._id = null;
    card.listId = this._id;
    const list = Lists.findOne(card.listId);
    card.boardId = list.boardId;
    const textarea = $(evt.currentTarget).parents('.content').find('textarea');
    const titleEntry = textarea.val().trim();
    // insert new card to the bottom of new list
    card.sort = Lists.findOne(this._id).cards().count();

    if (titleEntry) {
      const titleList = JSON.parse(titleEntry);
      for (let i = 0; i < titleList.length; i++){
        const obj = titleList[i];
        card.title = obj.title;
        card.description = obj.description;
        card.coverId = '';
        const _id = Cards.insert(card);
        // In case the filter is active we need to add the newly inserted card in
        // the list of exceptions -- cards that are not filtered. Otherwise the
        // card will disappear instantly.
        // See https://github.com/wekan/wekan/issues/80
        Filter.addException(_id);

        // copy checklists
        let cursor = Checklists.find({cardId: oldId});
        cursor.forEach(function() {
          'use strict';
          const checklist = arguments[0];
          checklist.cardId = _id;
          checklist._id = null;
          Checklists.insert(checklist);
        });

        // copy card comments
        cursor = CardComments.find({cardId: oldId});
        cursor.forEach(function () {
          'use strict';
          const comment = arguments[0];
          comment.cardId = _id;
          comment._id = null;
          CardComments.insert(comment);
        });
      }
      Popup.close();
    }
  },
});


Template.cardMorePopup.events({
  'click .js-copy-card-link-to-clipboard' () {
    // Clipboard code from:
    // https://stackoverflow.com/questions/6300213/copy-selected-text-to-the-clipboard-without-using-flash-must-be-cross-browser
    const StringToCopyElement = document.getElementById('cardURL');
    StringToCopyElement.select();
    if (document.execCommand('copy')) {
      StringToCopyElement.blur();
    } else {
      document.getElementById('cardURL').selectionStart = 0;
      document.getElementById('cardURL').selectionEnd = 999;
      document.execCommand('copy');
      if (window.getSelection) {
        if (window.getSelection().empty) { // Chrome
          window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) { // Firefox
          window.getSelection().removeAllRanges();
        }
      } else if (document.selection) { // IE?
        document.selection.empty();
      }
    }
  },
  'click .js-delete': Popup.afterConfirm('cardDelete', function () {
    Popup.close();
    Cards.remove(this._id);
    Utils.goBoardId(this.boardId);
  }),
});

// Close the card details pane by pressing escape
EscapeActions.register('detailsPane',
  () => {
    Utils.goBoardId(Session.get('currentBoard'));
  },
  () => {
    return !Session.equals('currentCard', null);
  }, {
    noClickEscapeOn: '.js-card-details,.board-sidebar,#header',
  }
);
