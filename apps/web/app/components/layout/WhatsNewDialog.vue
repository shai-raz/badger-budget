<script setup lang="ts">
import { releasesForMode, typeLabel, whatsNewStartAction } from "../../utils/whatsNew";

// Mounted once in layouts/app.vue. The changelog decides on the first load whether to open (a newer build with
// notes the user has not seen), stamp silently (nothing to show) or do nothing. Closing the dialog from any path
// stores the running version, so the same release never reopens the dialog.
const { data } = useChangelog();
const markSeen = useMarkChangelogSeen();
const { state, openUnseen, close } = useWhatsNewDialog();

// Runs once per app load; the cache updates after the stamp, so the guard keeps a later refetch from re-deciding.
let startHandled = false;
watch(
    data,
    (changelog) => {
        if (startHandled || !changelog) return;
        startHandled = true;
        const action = whatsNewStartAction(changelog);
        if (action === "open") openUnseen();
        else if (action === "mark-silently") markSeen.mutate();
    },
    { immediate: true },
);

const releases = computed(() => (data.value ? releasesForMode(data.value, state.value.mode) : []));

const onVisibleChange = (value: boolean) => {
    if (!value) close();
};

// After the dialog has fully hidden, so the unseen list does not empty out during the close animation.
const onAfterHide = () => {
    if (data.value?.showOnStart) markSeen.mutate();
};

const formatReleaseDate = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });

const prNumber = (prUrl: string) => prUrl.split("/").pop();
</script>

<template>
    <Dialog
        :visible="state.visible"
        modal
        :draggable="false"
        header="What's new"
        :style="{ width: '40rem' }"
        @update:visible="onVisibleChange"
        @after-hide="onAfterHide"
    >
        <div
            v-if="releases.length"
            class="flex flex-col gap-6"
        >
            <section
                v-for="release in releases"
                :key="release.version"
                class="flex flex-col gap-2"
                :aria-labelledby="`whats-new-${release.version}`"
            >
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3
                        :id="`whats-new-${release.version}`"
                        class="text-base font-semibold"
                    >
                        Version {{ release.version }}
                    </h3>
                    <time
                        :datetime="release.date"
                        class="text-sm text-muted-color"
                        >{{ formatReleaseDate(release.date) }}</time
                    >
                </div>
                <p
                    v-if="release.summary"
                    class="text-sm"
                >
                    {{ release.summary }}
                </p>
                <ul
                    v-if="release.items.length"
                    class="flex flex-col gap-2"
                >
                    <li
                        v-for="(item, index) in release.items"
                        :key="index"
                        class="flex items-start gap-2"
                    >
                        <Tag
                            :value="typeLabel(item)"
                            :severity="item.breaking ? 'danger' : 'secondary'"
                            class="shrink-0"
                        />
                        <span class="min-w-0 flex-1">{{ item.subject }}</span>
                        <a
                            v-if="item.prUrl"
                            :href="item.prUrl"
                            target="_blank"
                            rel="noopener"
                            class="shrink-0 text-sm text-primary hover:underline"
                            :aria-label="`Pull request #${prNumber(item.prUrl)} for ${item.subject}`"
                            >#{{ prNumber(item.prUrl) }}</a
                        >
                    </li>
                </ul>
            </section>
        </div>
        <p v-else>No release notes yet.</p>

        <template #footer>
            <Button
                label="Close"
                severity="secondary"
                class="ml-auto"
                @click="close"
            />
        </template>
    </Dialog>
</template>
