import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from './ui/Icon';
import { Button } from './ui/Button';
import { capsule, corner, hairline, radius, useTheme } from '../theme';
import { useTranslation } from '../i18n';
import { documentRepository } from '../services';
import { normalizeTag, normalizeTagList } from '../utils/organization';

interface TagEditModalProps {
  visible: boolean;
  documentId: string;
  initialTags?: string[];
  onClose: () => void;
  onSaved: (tags: string[]) => void;
}

export const TagEditModal: React.FC<TagEditModalProps> = ({
  visible,
  documentId,
  initialTags = [],
  onClose,
  onSaved,
}) => {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  const [tags, setTags] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [allExistingTags, setAllExistingTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAllTags = useCallback(async () => {
    try {
      const list = await documentRepository.getAllTags();
      setAllExistingTags(list);
    } catch {
      // ignore
    }
  }, []);

  const handleModalShow = useCallback(() => {
    setTags(normalizeTagList(initialTags));
    setInputText('');
    void loadAllTags();
  }, [initialTags, loadAllTags]);

  const handleAddTag = (tagToAdd: string) => {
    const clean = normalizeTag(tagToAdd);
    if (!clean) return;
    setTags((prev) => normalizeTagList([...prev, clean]));
    setInputText('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const key = tagToRemove.toLowerCase();
    setTags((prev) => prev.filter((t) => t.toLowerCase() !== key));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await documentRepository.setTags(documentId, tags);
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const suggestions = allExistingTags.filter(
    (existing) => !tags.some((t) => t.toLowerCase() === existing.toLowerCase())
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={handleModalShow}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <TouchableOpacity disabled={saving} onPress={onClose} style={styles.headerBtn}>
              <Text style={[typography.body, { color: colors.primary }]}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <Text style={[typography.headline, styles.headerTitle, { color: colors.textPrimary }]}>
              {t.tags.editTags}
            </Text>
            <TouchableOpacity
              disabled={saving}
              onPress={() => void handleSave()}
              style={[styles.headerBtn, { alignItems: 'flex-end' }]}
            >
              <Text style={[typography.bodyBold, { color: colors.primary }]}>{t.common.save}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: 48 }}>
            {/* Active Tags */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[typography.subhead, { color: colors.textSecondary, marginBottom: 10 }]}>
                {t.tags.title}
              </Text>

              {tags.length === 0 ? (
                <Text style={[typography.footnote, { color: colors.textMuted }]}>
                  {t.tags.noTags}
                </Text>
              ) : (
                <View style={styles.chipWrap}>
                  {tags.map((tag) => (
                    <View
                      key={tag}
                      style={[styles.tagChip, { backgroundColor: colors.primarySubdued }]}
                    >
                      <Text style={[typography.footnote, { color: colors.primary, fontWeight: '600' }]}>
                        #{tag}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveTag(tag)}
                        style={styles.chipRemoveBtn}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Icon name="xmark" size={12} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Input field to add a new tag */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: 12 }]}>
              <View style={styles.inputRow}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={t.tags.addTagPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={() => handleAddTag(inputText)}
                  returnKeyType="done"
                  autoCapitalize="words"
                  style={[
                    typography.body,
                    styles.textInput,
                    { color: colors.textPrimary, backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight },
                  ]}
                />
                <Button
                  title="+"
                  size="medium"
                  disabled={!inputText.trim()}
                  onPress={() => handleAddTag(inputText)}
                  style={{ minWidth: 44 }}
                />
              </View>
            </View>

            {/* Existing tag suggestions */}
            {suggestions.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: 12 }]}>
                <Text style={[typography.subhead, { color: colors.textSecondary, marginBottom: 10 }]}>
                  {t.tags.suggestions}
                </Text>
                <View style={styles.chipWrap}>
                  {suggestions.map((sug) => (
                    <TouchableOpacity
                      key={sug}
                      onPress={() => handleAddTag(sug)}
                      style={[styles.sugChip, { backgroundColor: colors.surfaceSubdued, borderColor: colors.borderLight }]}
                    >
                      <Text style={[typography.caption1, { color: colors.textPrimary }]}>
                        + #{sug}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: hairline,
  },
  headerBtn: {
    minWidth: 70,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  card: {
    ...corner(radius.md),
    borderWidth: hairline,
    padding: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 6,
    ...capsule(28),
  },
  chipRemoveBtn: {
    marginLeft: 6,
    padding: 3,
  },
  sugChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: hairline,
    ...capsule(28),
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderWidth: hairline,
    ...corner(radius.sm),
  },
});
