package com.spenza.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.text.InputType;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ProgressBar;
import android.widget.HorizontalScrollView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ExpenseWidgetActivity extends Activity {
    private static final int REQUEST_RECORD_AUDIO = 40_010;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private SpeechRecognizer speechRecognizer;
    private String selectedType;
    private String selectedAmountKind;
    private String selectedAccountId;
    private String parsedDate;
    private double prefillAmount;
    private String prefillComment;
    private boolean openedFromSpendPrompt;
    private EditText amountInput;
    private EditText commentInput;
    private TextView titleText;
    private TextView eyebrowText;
    private TextView helperText;
    private TextView typeLabel;
    private TextView statusText;
    private LinearLayout typeSelectorContainer;
    private LinearLayout accountSelectorContainer;
    private TextView accountLabel;
    private ProgressBar progressBar;
    private ImageButton micButton;
    private ThemedDropdown typeDropdown;
    private Palette palette;
    private final ArrayList<JSONObject> activeAccounts = new ArrayList<>();

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        palette = Palette.from(isDarkMode());
        prefs = WidgetExpenseQueue.prefs(this);
        String requestedType = getIntent().getStringExtra(WidgetExpenseConstants.WIDGET_CATEGORY_EXTRA);
        prefillAmount = getIntent().getDoubleExtra(WidgetExpenseConstants.WIDGET_AMOUNT_EXTRA, 0);
        prefillComment = getIntent().getStringExtra(WidgetExpenseConstants.WIDGET_COMMENT_EXTRA);
        selectedAmountKind = WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(
            getIntent().getStringExtra(WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXTRA)
        )
            ? WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT
            : WidgetExpenseConstants.WIDGET_AMOUNT_KIND_EXPENSE;
        openedFromSpendPrompt = WidgetExpenseConstants.WIDGET_SOURCE_NOTIFICATION_PROMPT.equals(
            getIntent().getStringExtra(WidgetExpenseConstants.WIDGET_SOURCE_EXTRA)
        );
        selectedType = WidgetExpenseConstants.TYPE_MORE.equals(requestedType)
            ? WidgetExpenseConstants.TYPE_MISC
            : WidgetExpenseUtils.normalizeWidgetType(requestedType);
        loadActiveAccounts();
        parsedDate = WidgetExpenseUtils.localDateToday();
        configureWindow();
        showExpenseForm();
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    private void configureWindow() {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.dimAmount = 0.28f;
            window.setAttributes(params);
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(palette.backgroundEnd);
        }
        overridePendingTransition(0, 0);
    }

    private void showExpenseForm() {
        View content = buildContent();
        setContentView(content);
        animateSheetIn(content);
    }

    private View buildContent() {
        FrameLayout container = new FrameLayout(this);
        container.setClipToPadding(false);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(false);
        scrollView.setClipToPadding(false);
        scrollView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        int padding = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(padding, padding, padding, padding);
        root.setBackground(sheetBackground());
        scrollView.addView(root, matchWrap());

        View handle = new View(this);
        handle.setBackground(handleBackground());
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(74), dp(5));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        root.addView(handle, handleParams);

        eyebrowText = new TextView(this);
        eyebrowText.setText(openedFromSpendPrompt ? "Detected spend" : "Quick expense");
        eyebrowText.setTextColor(palette.muted);
        eyebrowText.setTextSize(12);
        eyebrowText.setLetterSpacing(0f);
        eyebrowText.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(eyebrowText, marginTop(matchWrap(), 24));

        titleText = new TextView(this);
        titleText.setTextColor(palette.text);
        titleText.setTextSize(26);
        titleText.setGravity(Gravity.START);
        titleText.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(titleText, marginTop(matchWrap(), 4));

        helperText = new TextView(this);
        helperText.setTextColor(palette.muted);
        helperText.setTextSize(14);
        helperText.setLineSpacing(dp(2), 1f);
        root.addView(helperText, marginTop(matchWrap(), 6));

        typeLabel = new TextView(this);
        typeLabel.setText("Expense type");
        typeLabel.setTextColor(palette.muted);
        typeLabel.setTextSize(13);
        typeLabel.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(typeLabel, marginTop(matchWrap(), 22));

        typeSelectorContainer = new LinearLayout(this);
        typeSelectorContainer.setOrientation(LinearLayout.VERTICAL);
        typeSelectorContainer.addView(buildTypeSelector());
        root.addView(typeSelectorContainer, marginTop(matchWrap(), 10));

        accountSelectorContainer = new LinearLayout(this);
        accountSelectorContainer.setOrientation(LinearLayout.VERTICAL);
        accountSelectorContainer.addView(buildAccountSelector());
        root.addView(accountSelectorContainer, marginTop(matchWrap(), 22));

        amountInput = new EditText(this);
        amountInput.setHint("Amount");
        amountInput.setSingleLine(true);
        amountInput.setTextColor(palette.text);
        amountInput.setHintTextColor(palette.muted);
        amountInput.setTextSize(24);
        amountInput.setTypeface(Typeface.DEFAULT_BOLD);
        amountInput.setPadding(dp(20), dp(10), dp(20), dp(10));
        amountInput.setMinHeight(dp(66));
        amountInput.setBackground(inputBackground());
        amountInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        if (prefillAmount > 0) {
            amountInput.setText(String.valueOf(WidgetExpenseUtils.roundMoney(prefillAmount)));
        }
        enableClearButton(amountInput);
        root.addView(amountInput, marginTop(matchWrap(), 18));

        commentInput = new EditText(this);
        commentInput.setHint("Comment or tap mic");
        commentInput.setMinLines(1);
        commentInput.setMaxLines(3);
        commentInput.setTextColor(palette.text);
        commentInput.setHintTextColor(palette.muted);
        commentInput.setTextSize(15);
        commentInput.setPadding(dp(20), dp(10), dp(20), dp(10));
        commentInput.setMinHeight(dp(58));
        commentInput.setBackground(inputBackground());
        commentInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        if (prefillComment != null && !prefillComment.trim().isEmpty()) {
            commentInput.setText(prefillComment.trim());
        }
        enableClearButton(commentInput);
        root.addView(commentInput, marginTop(matchWrap(), 12));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL);

        micButton = micButton();
        micButton.setOnClickListener(v -> startVoiceCapture());
        LinearLayout.LayoutParams micParams = new LinearLayout.LayoutParams(dp(52), dp(52));
        micParams.setMargins(0, 0, dp(12), 0);
        actions.addView(micButton, micParams);

        Button cancelButton = actionButton("Cancel");
        styleButton(cancelButton, ButtonTone.SECONDARY);
        cancelButton.setOnClickListener(v -> finish());
        actions.addView(cancelButton, actionParams());

        Button saveButton = actionButton("Save");
        styleButton(saveButton, ButtonTone.PRIMARY);
        saveButton.setOnClickListener(v -> saveExpense());
        actions.addView(saveButton, actionParams());
        root.addView(actions, marginTop(matchWrap(), 22));

        if (!WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(selectedAmountKind)) {
            root.addView(buildQuickChips(), marginTop(matchWrap(), 18));
        }

        progressBar = new ProgressBar(this);
        progressBar.setVisibility(View.GONE);
        progressBar.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(palette.primaryEnd));
        root.addView(progressBar, marginTop(matchWrap(), 8));

        statusText = new TextView(this);
        statusText.setTextColor(palette.muted);
        statusText.setTextSize(12);
        statusText.setText("");
        root.addView(statusText, marginTop(matchWrap(), 8));

        updateAmountKindUi();

        FrameLayout.LayoutParams sheetParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        );
        container.addView(scrollView, sheetParams);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            container.setOnApplyWindowInsetsListener((view, insets) -> {
                int keyboardBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;
                int navigationBottom = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) scrollView.getLayoutParams();
                params.bottomMargin = Math.max(keyboardBottom, navigationBottom);
                params.height = FrameLayout.LayoutParams.WRAP_CONTENT;
                scrollView.setLayoutParams(params);
                return insets;
            });
        }
        return container;
    }

    private View buildTypeSelector() {
        ArrayList<DropdownOption> options = new ArrayList<>();
        for (int i = 0; i < WidgetExpenseConstants.ALLOWED_TYPES.length; i++) {
            String value = WidgetExpenseConstants.ALLOWED_TYPES[i];
            options.add(new DropdownOption(value, displayType(value), categoryIcon(value), categorySoftColor(value), categoryColor(value)));
        }
        typeDropdown = new ThemedDropdown(options, selectedType, value -> {
            selectedType = value;
            parsedDate = WidgetExpenseUtils.localDateToday();
            updateSelectedTypeUi();
        });
        return typeDropdown.view();
    }

    private View buildAccountSelector() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);

        accountLabel = new TextView(this);
        accountLabel.setText("Pay from account");
        accountLabel.setTextColor(palette.muted);
        accountLabel.setTextSize(13);
        accountLabel.setTypeface(Typeface.DEFAULT_BOLD);
        container.addView(accountLabel, matchWrap());

        ArrayList<DropdownOption> options = new ArrayList<>();
        for (JSONObject account : activeAccounts) {
            options.add(new DropdownOption(
                account.optString("id", ""),
                account.optString("name", "Account"),
                R.drawable.ic_widget_misc,
                palette.accountSoft,
                palette.account
            ));
        }
        if (options.isEmpty()) {
            options.add(new DropdownOption("", "No active accounts", R.drawable.ic_widget_misc, palette.disabledSoft, palette.muted));
        }
        ThemedDropdown dropdown = new ThemedDropdown(options, selectedAccountId == null ? "" : selectedAccountId, value -> {
            selectedAccountId = value == null || value.trim().isEmpty() ? null : value;
        });
        dropdown.setEnabled(!activeAccounts.isEmpty());
        container.addView(dropdown.view(), marginTop(matchWrap(), 8));
        return container;
    }

    private void updateSelectedTypeUi() {
        updateAmountKindUi();
        if (typeDropdown != null) {
            typeDropdown.setSelectedValue(selectedType);
        }
    }

    private int selectedTypeIndex() {
        for (int i = 0; i < WidgetExpenseConstants.ALLOWED_TYPES.length; i++) {
            if (WidgetExpenseConstants.ALLOWED_TYPES[i].equals(selectedType)) return i;
        }
        return -1;
    }

    private void updateAmountKindUi() {
        boolean credit = WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(selectedAmountKind);
        if (eyebrowText != null) {
            eyebrowText.setText(openedFromSpendPrompt ? (credit ? "Detected credit" : "Detected spend") : "Quick amount");
        }
        if (titleText != null) {
            titleText.setText(credit ? "Add received money" : "Add " + displayType(selectedType));
        }
        if (helperText != null) {
            helperText.setText(credit
                ? "Choose the account to increase. This saves as a Finance adjustment."
                : (openedFromSpendPrompt
                    ? "Review the amount before saving. Nothing is logged until you tap Save."
                    : "Saved locally first. Drive sync follows automatically."));
        }
        if (typeLabel != null) typeLabel.setVisibility(credit ? View.GONE : View.VISIBLE);
        if (typeSelectorContainer != null) typeSelectorContainer.setVisibility(credit ? View.GONE : View.VISIBLE);
        if (accountLabel != null) accountLabel.setText(credit ? "Receive into account" : "Pay from account");
        if (accountSelectorContainer != null) accountSelectorContainer.setVisibility(View.VISIBLE);
        if (micButton != null) {
            micButton.setContentDescription(credit ? "Record voice note" : "Record voice expense");
        }
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setMinHeight(dp(52));
        button.setPadding(dp(10), 0, dp(10), 0);
        button.setStateListAnimator(null);
        return button;
    }

    private ImageButton micButton() {
        ImageButton button = new ImageButton(this);
        button.setImageResource(R.drawable.ic_widget_mic);
        button.setColorFilter(Color.WHITE);
        button.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        button.setPadding(dp(15), dp(15), dp(15), dp(15));
        button.setContentDescription("Record voice expense");
        button.setBackground(micButtonBackground());
        button.setStateListAnimator(null);
        button.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    view.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start();
                    break;
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL:
                    view.animate().scaleX(1f).scaleY(1f).setDuration(140).start();
                    break;
                default:
                    break;
            }
            return false;
        });
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams actionParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(52), 1);
        params.setMargins(dp(4), 0, dp(4), 0);
        return params;
    }

    private LinearLayout.LayoutParams marginTop(LinearLayout.LayoutParams params, int topDp) {
        params.setMargins(params.leftMargin, dp(topDp), params.rightMargin, params.bottomMargin);
        return params;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private boolean isDarkMode() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private GradientDrawable sheetBackground() {
        GradientDrawable drawable = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] { palette.backgroundStart, palette.surface, palette.backgroundEnd }
        );
        drawable.setCornerRadii(new float[] {
            dp(34), dp(34), dp(34), dp(34),
            0, 0, 0, 0
        });
        drawable.setStroke(dp(1), palette.stroke);
        return drawable;
    }

    private GradientDrawable handleBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(palette.stroke);
        drawable.setCornerRadius(dp(3));
        return drawable;
    }

    private GradientDrawable inputBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(palette.input);
        drawable.setCornerRadius(dp(18));
        drawable.setStroke(dp(1), palette.stroke);
        return drawable;
    }

    private void enableClearButton(EditText input) {
        Drawable clearIcon = ContextCompat.getDrawable(this, R.drawable.ic_widget_clear);
        if (clearIcon == null) return;
        clearIcon.setBounds(0, 0, dp(18), dp(18));
        clearIcon.setTint(palette.muted);

        Runnable refreshIcon = () -> input.setCompoundDrawables(
            null,
            null,
            input.getText().length() > 0 ? clearIcon : null,
            null
        );
        input.setCompoundDrawablePadding(dp(12));
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence text, int start, int before, int count) {
                refreshIcon.run();
            }
            @Override public void afterTextChanged(Editable editable) {}
        });
        input.setOnTouchListener((view, event) -> {
            if (event.getAction() != android.view.MotionEvent.ACTION_UP || input.getText().length() == 0) {
                return false;
            }
            Drawable endIcon = input.getCompoundDrawables()[2];
            if (endIcon == null || event.getX() < input.getWidth() - input.getPaddingEnd() - endIcon.getBounds().width()) {
                return false;
            }
            input.setText("");
            return true;
        });
        refreshIcon.run();
    }

    private GradientDrawable selectBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(palette.control);
        drawable.setCornerRadius(dp(18));
        drawable.setStroke(dp(1), palette.stroke);
        return drawable;
    }

    private GradientDrawable dropdownPanelBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(palette.popover);
        drawable.setCornerRadius(dp(18));
        drawable.setStroke(dp(1), palette.stroke);
        return drawable;
    }

    private GradientDrawable dropdownRowBackground(boolean selected) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(selected ? palette.primaryStart : Color.TRANSPARENT);
        drawable.setCornerRadius(dp(14));
        return drawable;
    }

    private GradientDrawable iconBadgeBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(12));
        return drawable;
    }

    private void styleButton(Button button, ButtonTone tone) {
        GradientDrawable normal = new GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            tone == ButtonTone.PRIMARY
                ? new int[] { palette.primaryStart, palette.primaryEnd }
                : new int[] { palette.secondary, palette.secondary }
        );
        normal.setCornerRadius(dp(16));
        normal.setStroke(dp(1), tone == ButtonTone.PRIMARY ? 0x44FFFFFF : palette.stroke);
        button.setTextColor(tone == ButtonTone.PRIMARY ? Color.WHITE : palette.primaryStart);
        button.setBackground(new RippleDrawable(
            android.content.res.ColorStateList.valueOf(tone == ButtonTone.PRIMARY ? 0x33FFFFFF : palette.ripple),
            normal,
            null
        ));
        button.setOnTouchListener((view, event) -> {
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    view.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start();
                    break;
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL:
                    view.animate().scaleX(1f).scaleY(1f).setDuration(140).start();
                    break;
                default:
                    break;
            }
            return false;
        });
    }

    private RippleDrawable micButtonBackground() {
        GradientDrawable normal = new GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            new int[] { palette.primaryStart, palette.primaryEnd }
        );
        normal.setShape(GradientDrawable.OVAL);
        normal.setStroke(dp(1), 0x44FFFFFF);
        return new RippleDrawable(
            android.content.res.ColorStateList.valueOf(0x33FFFFFF),
            normal,
            null
        );
    }

    private View buildQuickChips() {
        HorizontalScrollView scrollView = new HorizontalScrollView(this);
        scrollView.setHorizontalScrollBarEnabled(false);
        scrollView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        String[] chips = { "🍔 Lunch", "☕ Coffee", "🥗 Dinner", "🥕 Groceries", "⛽ Fuel" };
        for (String chip : chips) {
            TextView chipView = new TextView(this);
            chipView.setText(chip);
            chipView.setTextColor(palette.chipText);
            chipView.setTextSize(14);
            chipView.setGravity(Gravity.CENTER);
            chipView.setPadding(dp(14), 0, dp(14), 0);
            chipView.setBackground(chipBackground());
            chipView.setOnClickListener(v -> {
                String value = ((TextView) v).getText().toString();
                commentInput.setText(value.replaceAll("^[^\\p{L}\\p{N}]+\\s*", ""));
                popView(commentInput);
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(40));
            params.setMargins(0, 0, dp(10), 0);
            row.addView(chipView, params);
        }
        scrollView.addView(row, new HorizontalScrollView.LayoutParams(HorizontalScrollView.LayoutParams.WRAP_CONTENT, HorizontalScrollView.LayoutParams.WRAP_CONTENT));
        return scrollView;
    }

    private GradientDrawable chipBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(palette.chip);
        drawable.setCornerRadius(dp(20));
        drawable.setStroke(dp(1), palette.chipStroke);
        return drawable;
    }

    private void animateSheetIn(View content) {
        content.setAlpha(0f);
        content.setTranslationY(dp(42));
        content.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(260)
            .setInterpolator(new android.view.animation.DecelerateInterpolator())
            .start();
    }

    private void startVoiceCapture() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            toast("Voice input is not available on this device.");
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO);
            return;
        }
        listenForComment();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            listenForComment();
        }
    }

    private void listenForComment() {
        setBusy(true, "Listening...");
        pulseMic(true);
        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { setBusy(true, "Understanding..."); }
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onError(int error) {
                    pulseMic(false);
                    setBusy(false, "Voice input failed. You can type the comment.");
                }

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String transcript = matches == null || matches.isEmpty() ? "" : matches.get(0);
                    commentInput.setText(transcript);
                    pulseMic(false);
                    parseVoiceExpense(transcript);
                }
            });
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        speechRecognizer.startListening(intent);
    }

    private void parseVoiceExpense(String transcript) {
        String apiKey = activeGeminiKey();
        if (apiKey == null || transcript.trim().isEmpty()) {
            setBusy(false, apiKey == null ? "Saved voice text. Add Gemini key in app settings for smart fill." : "");
            return;
        }

        setBusy(true, "Smart filling with Gemini...");
        executor.execute(() -> {
            try {
                JSONObject expense = callVoiceParser(apiKey, transcript);
                runOnUiThread(() -> applyParsedExpense(expense));
            } catch (Exception error) {
                runOnUiThread(() -> setBusy(false, "Voice text saved. Gemini smart fill was unavailable."));
            }
        });
    }

    private JSONObject callVoiceParser(String apiKey, String transcript) throws IOException, JSONException {
        URL url = new URL(WidgetExpenseConstants.FUNCTIONS_BASE_URL + "/parse-voice-expense");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("X-Gemini-Api-Key", apiKey);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(25_000);
        connection.setDoOutput(true);

        JSONObject body = new JSONObject();
        body.put("transcript", transcript);
        body.put("locale", Locale.getDefault().toLanguageTag());
        body.put("currency", currentCurrency());
        body.put("today", WidgetExpenseUtils.localDateToday());
        JSONArray categories = new JSONArray();
        for (String type : WidgetExpenseConstants.ALLOWED_TYPES) categories.put(type);
        body.put("categories", categories);

        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }

        String response = readResponse(connection);
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            throw new IOException("Voice parse failed: " + connection.getResponseCode() + " " + response);
        }
        return new JSONObject(response).optJSONObject("expense");
    }

    private void applyParsedExpense(JSONObject expense) {
        if (expense == null || !expense.optBoolean("readable", false)) {
            setBusy(false, "Voice text saved. Enter amount if needed.");
            return;
        }

        double amount = expense.optDouble("amount", 0);
        if (amount > 0) {
            amountInput.setText(String.valueOf(WidgetExpenseUtils.roundMoney(amount)));
            popView(amountInput);
        }

        String parsedType = WidgetExpenseUtils.normalizeWidgetType(expense.optString("type", selectedType));
        selectedType = parsedType;
        parsedDate = expense.optString("date", WidgetExpenseUtils.localDateToday());
        updateSelectedTypeUi();

        String parsedComment = expense.optString("comment", "").trim();
        if (!parsedComment.isEmpty()) {
            commentInput.setText(parsedComment);
            popView(commentInput);
        }
        setBusy(false, "Smart fill ready.");
    }

    private void saveExpense() {
        double amount;
        try {
            amount = Double.parseDouble(amountInput.getText().toString().trim());
        } catch (NumberFormatException error) {
            toast("Enter a valid amount.");
            return;
        }
        if (amount <= 0) {
            toast("Enter a valid amount.");
            return;
        }

        if (WidgetExpenseConstants.WIDGET_AMOUNT_KIND_CREDIT.equals(selectedAmountKind)) {
            saveCredit(amount);
            return;
        }

        try {
            JSONObject entry = WidgetExpenseUtils.buildExpenseEntry(
                prefs,
                selectedType,
                amount,
                commentInput.getText().toString(),
                parsedDate,
                selectedAccountId
            );
            WidgetExpenseQueue.enqueue(this, entry);
            ExpenseWidgetProvider.updateAll(this);
            toast("Expense queued for Drive sync.");
            finishWithAnimation();
        } catch (JSONException error) {
            toast("Could not queue expense.");
        }
    }

    private void saveCredit(double amount) {
        if (selectedAccountId == null || selectedAccountId.trim().isEmpty()) {
            toast(activeAccounts.isEmpty() ? "Add an account in Finances first." : "Choose an account.");
            return;
        }

        try {
            JSONObject adjustment = WidgetExpenseUtils.buildAccountAdjustment(
                prefs,
                selectedAccountId,
                amount,
                commentInput.getText().toString()
            );
            WidgetExpenseQueue.enqueueAdjustment(this, adjustment);
            ExpenseWidgetProvider.updateAll(this);
            toast("Credit queued for account adjustment.");
            finishWithAnimation();
        } catch (JSONException error) {
            toast("Could not queue credit.");
        }
    }

    private void loadActiveAccounts() {
        activeAccounts.clear();
        JSONArray accounts = WidgetExpenseUtils.activeAccounts(prefs);
        int defaultIndex = -1;
        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i);
            if (account == null) continue;
            activeAccounts.add(account);
            if (account.optBoolean("isDefault", false)) defaultIndex = activeAccounts.size() - 1;
        }
        if (activeAccounts.isEmpty()) {
            selectedAccountId = null;
            return;
        }
        JSONObject selected = activeAccounts.get(defaultIndex >= 0 ? defaultIndex : 0);
        selectedAccountId = selected.optString("id", null);
    }

    private int selectedAccountIndex() {
        if (selectedAccountId == null) return activeAccounts.isEmpty() ? -1 : 0;
        for (int i = 0; i < activeAccounts.size(); i++) {
            if (selectedAccountId.equals(activeAccounts.get(i).optString("id", null))) return i;
        }
        return activeAccounts.isEmpty() ? -1 : 0;
    }

    private String activeGeminiKey() {
        String raw = prefs.getString(WidgetExpenseConstants.AI_SETTINGS_KEY, null);
        if (raw == null) return null;
        try {
            JSONObject settings = new JSONObject(raw);
            if (!"user-key".equals(settings.optString("provider"))) return null;
            String key = settings.optString("geminiApiKey", "").trim();
            return key.isEmpty() ? null : key;
        } catch (JSONException ignored) {
            return null;
        }
    }

    private String currentCurrency() {
        String savedCurrency = prefs.getString(WidgetExpenseConstants.CURRENCY_KEY, null);
        if (savedCurrency != null && !savedCurrency.trim().isEmpty()) return savedCurrency;

        String raw = prefs.getString(WidgetExpenseConstants.LOCAL_BACKUP_CACHE_KEY, null);
        if (raw != null) {
            try {
                JSONObject metadata = new JSONObject(raw).optJSONObject("doc").optJSONObject("metadata");
                String currency = metadata == null ? null : metadata.optString("currency", null);
                if (currency != null && !currency.trim().isEmpty()) return currency;
            } catch (Exception ignored) {
                // Use app default.
            }
        }
        return "INR";
    }

    private static String readResponse(HttpURLConnection connection) throws IOException {
        InputStream stream = connection.getResponseCode() >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
            return builder.toString();
        }
    }

    private void setBusy(boolean busy, String message) {
        progressBar.setVisibility(busy ? View.VISIBLE : View.GONE);
        micButton.setEnabled(!busy);
        statusText.setText(message == null ? "" : message);
    }

    private void pulseMic(boolean enabled) {
        if (micButton == null) return;
        micButton.animate().cancel();
        if (!enabled) {
            micButton.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(140).start();
            return;
        }
        micButton.animate()
            .scaleX(1.06f)
            .scaleY(1.06f)
            .alpha(0.86f)
            .setDuration(420)
            .withEndAction(() -> {
                if (progressBar != null && progressBar.getVisibility() == View.VISIBLE) pulseMic(true);
            })
            .start();
    }

    private void popView(View view) {
        view.setScaleX(0.98f);
        view.setScaleY(0.98f);
        view.animate().scaleX(1f).scaleY(1f).setDuration(180).start();
    }

    private void finishWithAnimation() {
        View content = getWindow().getDecorView();
        content.animate()
            .alpha(0f)
            .translationY(dp(28))
            .setDuration(180)
            .withEndAction(this::finish)
            .start();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private String displayType(String type) {
        if (WidgetExpenseConstants.TYPE_HOUSING.equals(type)) return "Housing";
        if (WidgetExpenseConstants.TYPE_FOOD.equals(type)) return "Food";
        if (WidgetExpenseConstants.TYPE_TRANSPORT.equals(type)) return "Transport";
        if (WidgetExpenseConstants.TYPE_UTILITIES.equals(type)) return "Utilities";
        if (WidgetExpenseConstants.TYPE_HEALTHCARE.equals(type)) return "Healthcare";
        if (WidgetExpenseConstants.TYPE_ENTERTAINMENT.equals(type)) return "Fun";
        if (WidgetExpenseConstants.TYPE_DINING.equals(type)) return "Dining";
        if (WidgetExpenseConstants.TYPE_SHOPPING.equals(type)) return "Shopping";
        if (WidgetExpenseConstants.TYPE_SAVINGS.equals(type)) return "Savings";
        if (WidgetExpenseConstants.TYPE_INVESTMENTS.equals(type)) return "Investments";
        if (WidgetExpenseConstants.TYPE_EDUCATION.equals(type)) return "Education";
        if (WidgetExpenseConstants.TYPE_PERSONAL.equals(type)) return "Personal";
        if (WidgetExpenseConstants.TYPE_SUBSCRIPTIONS.equals(type)) return "Subscriptions";
        if (WidgetExpenseConstants.TYPE_MISC.equals(type)) return "Misc";
        return type;
    }

    private int categoryIcon(String type) {
        if (WidgetExpenseConstants.TYPE_FOOD.equals(type) || WidgetExpenseConstants.TYPE_DINING.equals(type)) {
            return R.drawable.ic_widget_food;
        }
        if (WidgetExpenseConstants.TYPE_TRANSPORT.equals(type)) return R.drawable.ic_widget_transport;
        if (WidgetExpenseConstants.TYPE_ENTERTAINMENT.equals(type)) return R.drawable.ic_widget_entertainment;
        if (WidgetExpenseConstants.TYPE_SHOPPING.equals(type)) return R.drawable.ic_widget_shopping;
        return R.drawable.ic_widget_misc;
    }

    private int categoryColor(String type) {
        if (WidgetExpenseConstants.TYPE_FOOD.equals(type) || WidgetExpenseConstants.TYPE_DINING.equals(type)) return palette.food;
        if (WidgetExpenseConstants.TYPE_TRANSPORT.equals(type)) return palette.transport;
        if (WidgetExpenseConstants.TYPE_ENTERTAINMENT.equals(type)) return palette.entertainment;
        if (WidgetExpenseConstants.TYPE_SHOPPING.equals(type)) return palette.shopping;
        if (WidgetExpenseConstants.TYPE_SAVINGS.equals(type) || WidgetExpenseConstants.TYPE_INVESTMENTS.equals(type)) return palette.success;
        return palette.misc;
    }

    private int categorySoftColor(String type) {
        if (WidgetExpenseConstants.TYPE_FOOD.equals(type) || WidgetExpenseConstants.TYPE_DINING.equals(type)) return palette.foodSoft;
        if (WidgetExpenseConstants.TYPE_TRANSPORT.equals(type)) return palette.transportSoft;
        if (WidgetExpenseConstants.TYPE_ENTERTAINMENT.equals(type)) return palette.entertainmentSoft;
        if (WidgetExpenseConstants.TYPE_SHOPPING.equals(type)) return palette.shoppingSoft;
        if (WidgetExpenseConstants.TYPE_SAVINGS.equals(type) || WidgetExpenseConstants.TYPE_INVESTMENTS.equals(type)) return palette.successSoft;
        return palette.miscSoft;
    }

    private ImageView iconView(int drawableId, int tint) {
        ImageView icon = new ImageView(this);
        icon.setImageResource(drawableId);
        icon.setColorFilter(tint);
        icon.setScaleType(ImageView.ScaleType.CENTER);
        return icon;
    }

    private TextView chevronView() {
        TextView chevron = new TextView(this);
        chevron.setText("⌄");
        chevron.setTextColor(palette.muted);
        chevron.setTextSize(22);
        chevron.setGravity(Gravity.CENTER);
        chevron.setTypeface(Typeface.DEFAULT_BOLD);
        return chevron;
    }

    private interface DropdownSelectionListener {
        void onSelected(String value);
    }

    private final class ThemedDropdown {
        private final ArrayList<DropdownOption> options;
        private final DropdownSelectionListener listener;
        private final LinearLayout trigger;
        private final TextView selectedLabel;
        private final ImageView selectedIcon;
        private final TextView chevron;
        private PopupWindow popup;
        private String selectedValue;
        private boolean enabled = true;

        ThemedDropdown(ArrayList<DropdownOption> options, String selectedValue, DropdownSelectionListener listener) {
            this.options = options;
            this.selectedValue = selectedValue == null ? "" : selectedValue;
            this.listener = listener;
            trigger = new LinearLayout(ExpenseWidgetActivity.this);
            trigger.setOrientation(LinearLayout.HORIZONTAL);
            trigger.setGravity(Gravity.CENTER_VERTICAL);
            trigger.setPadding(dp(14), dp(8), dp(12), dp(8));
            trigger.setMinimumHeight(dp(54));
            trigger.setBackground(selectBackground());
            trigger.setClickable(true);
            trigger.setFocusable(true);

            FrameLayout badge = new FrameLayout(ExpenseWidgetActivity.this);
            selectedIcon = iconView(R.drawable.ic_widget_misc, palette.primaryStart);
            badge.setBackground(iconBadgeBackground(palette.primarySoft));
            badge.addView(selectedIcon, new FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER));
            LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(dp(34), dp(34));
            badgeParams.setMargins(0, 0, dp(12), 0);
            trigger.addView(badge, badgeParams);

            selectedLabel = new TextView(ExpenseWidgetActivity.this);
            selectedLabel.setTextColor(palette.text);
            selectedLabel.setTextSize(14);
            selectedLabel.setTypeface(Typeface.DEFAULT_BOLD);
            selectedLabel.setSingleLine(true);
            selectedLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);
            trigger.addView(selectedLabel, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

            chevron = chevronView();
            trigger.addView(chevron, new LinearLayout.LayoutParams(dp(28), dp(32)));

            trigger.setOnClickListener(v -> {
                if (enabled) showPopup();
            });
            applySelectedOption();
        }

        View view() {
            return trigger;
        }

        void setEnabled(boolean enabled) {
            this.enabled = enabled;
            trigger.setEnabled(enabled);
            trigger.setAlpha(enabled ? 1f : 0.58f);
        }

        void setSelectedValue(String value) {
            this.selectedValue = value == null ? "" : value;
            applySelectedOption();
        }

        private void applySelectedOption() {
            DropdownOption option = selectedOption();
            if (option == null && !options.isEmpty()) option = options.get(0);
            if (option == null) return;
            selectedLabel.setText(option.label);
            selectedIcon.setImageResource(option.iconResId);
            selectedIcon.setColorFilter(option.iconTint);
            View badge = (View) selectedIcon.getParent();
            badge.setBackground(iconBadgeBackground(option.iconBackground));
        }

        private DropdownOption selectedOption() {
            for (DropdownOption option : options) {
                if (option.value.equals(selectedValue)) return option;
            }
            return null;
        }

        private void showPopup() {
            LinearLayout list = new LinearLayout(ExpenseWidgetActivity.this);
            list.setOrientation(LinearLayout.VERTICAL);
            list.setPadding(dp(6), dp(6), dp(6), dp(6));
            list.setBackground(dropdownPanelBackground());

            for (DropdownOption option : options) {
                list.addView(row(option), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));
            }

            ScrollView popupScroll = new ScrollView(ExpenseWidgetActivity.this);
            popupScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
            popupScroll.addView(list, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));

            int visibleRows = Math.min(options.size(), 5);
            int popupHeight = dp((visibleRows * 48) + 12);
            popup = new PopupWindow(popupScroll, trigger.getWidth(), popupHeight, true);
            popup.setOutsideTouchable(true);
            popup.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) popup.setElevation(dp(14));
            chevron.animate().rotation(180f).setDuration(140).start();
            popup.setOnDismissListener(() -> chevron.animate().rotation(0f).setDuration(140).start());
            popup.showAsDropDown(trigger, 0, dp(8));
        }

        private View row(DropdownOption option) {
            boolean selected = option.value.equals(selectedValue);
            LinearLayout row = new LinearLayout(ExpenseWidgetActivity.this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(8), 0, dp(8), 0);
            row.setBackground(dropdownRowBackground(selected));
            row.setClickable(true);

            FrameLayout badge = new FrameLayout(ExpenseWidgetActivity.this);
            ImageView icon = iconView(option.iconResId, selected ? Color.WHITE : option.iconTint);
            badge.setBackground(iconBadgeBackground(selected ? 0x22FFFFFF : option.iconBackground));
            badge.addView(icon, new FrameLayout.LayoutParams(dp(17), dp(17), Gravity.CENTER));
            LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(dp(32), dp(32));
            badgeParams.setMargins(0, 0, dp(12), 0);
            row.addView(badge, badgeParams);

            TextView label = new TextView(ExpenseWidgetActivity.this);
            label.setText(option.label);
            label.setTextSize(14);
            label.setTypeface(Typeface.DEFAULT_BOLD);
            label.setSingleLine(true);
            label.setEllipsize(android.text.TextUtils.TruncateAt.END);
            label.setTextColor(selected ? Color.WHITE : palette.text);
            row.addView(label, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

            TextView check = new TextView(ExpenseWidgetActivity.this);
            check.setText(selected ? "✓" : "");
            check.setTextSize(16);
            check.setTypeface(Typeface.DEFAULT_BOLD);
            check.setTextColor(Color.WHITE);
            check.setGravity(Gravity.CENTER);
            row.addView(check, new LinearLayout.LayoutParams(dp(26), LinearLayout.LayoutParams.MATCH_PARENT));

            row.setOnClickListener(v -> {
                selectedValue = option.value;
                applySelectedOption();
                listener.onSelected(option.value);
                if (popup != null) popup.dismiss();
            });
            return row;
        }
    }

    private static final class DropdownOption {
        final String value;
        final String label;
        final int iconResId;
        final int iconBackground;
        final int iconTint;

        DropdownOption(String value, String label, int iconResId, int iconBackground, int iconTint) {
            this.value = value == null ? "" : value;
            this.label = label;
            this.iconResId = iconResId;
            this.iconBackground = iconBackground;
            this.iconTint = iconTint;
        }
    }

    private static final class Palette {
        final int backgroundStart;
        final int backgroundEnd;
        final int surface;
        final int popover;
        final int control;
        final int input;
        final int secondary;
        final int text;
        final int muted;
        final int stroke;
        final int primaryStart;
        final int primaryEnd;
        final int primarySoft;
        final int ripple;
        final int chip;
        final int chipStroke;
        final int chipText;
        final int food;
        final int transport;
        final int entertainment;
        final int shopping;
        final int misc;
        final int success;
        final int expense;
        final int account;
        final int foodSoft;
        final int transportSoft;
        final int entertainmentSoft;
        final int shoppingSoft;
        final int miscSoft;
        final int successSoft;
        final int expenseSoft;
        final int accountSoft;
        final int disabledSoft;

        private Palette(
            int backgroundStart,
            int backgroundEnd,
            int surface,
            int popover,
            int control,
            int input,
            int secondary,
            int text,
            int muted,
            int stroke,
            int primaryStart,
            int primaryEnd,
            int primarySoft,
            int ripple,
            int chip,
            int chipStroke,
            int chipText,
            int food,
            int transport,
            int entertainment,
            int shopping,
            int misc,
            int success,
            int expense,
            int account,
            int foodSoft,
            int transportSoft,
            int entertainmentSoft,
            int shoppingSoft,
            int miscSoft,
            int successSoft,
            int expenseSoft,
            int accountSoft,
            int disabledSoft
        ) {
            this.backgroundStart = backgroundStart;
            this.backgroundEnd = backgroundEnd;
            this.surface = surface;
            this.popover = popover;
            this.control = control;
            this.input = input;
            this.secondary = secondary;
            this.text = text;
            this.muted = muted;
            this.stroke = stroke;
            this.primaryStart = primaryStart;
            this.primaryEnd = primaryEnd;
            this.primarySoft = primarySoft;
            this.ripple = ripple;
            this.chip = chip;
            this.chipStroke = chipStroke;
            this.chipText = chipText;
            this.food = food;
            this.transport = transport;
            this.entertainment = entertainment;
            this.shopping = shopping;
            this.misc = misc;
            this.success = success;
            this.expense = expense;
            this.account = account;
            this.foodSoft = foodSoft;
            this.transportSoft = transportSoft;
            this.entertainmentSoft = entertainmentSoft;
            this.shoppingSoft = shoppingSoft;
            this.miscSoft = miscSoft;
            this.successSoft = successSoft;
            this.expenseSoft = expenseSoft;
            this.accountSoft = accountSoft;
            this.disabledSoft = disabledSoft;
        }

        static Palette from(boolean dark) {
            if (dark) {
                return new Palette(
                    Color.rgb(17, 24, 39),
                    Color.rgb(32, 19, 57),
                    Color.rgb(30, 41, 59),
                    Color.rgb(24, 32, 48),
                    Color.argb(42, 255, 255, 255),
                    Color.argb(32, 255, 255, 255),
                    Color.rgb(39, 50, 72),
                    Color.rgb(248, 250, 252),
                    Color.rgb(203, 213, 225),
                    Color.rgb(62, 51, 90),
                    Color.rgb(167, 139, 250),
                    Color.rgb(232, 121, 249),
                    Color.argb(42, 167, 139, 250),
                    Color.argb(38, 255, 255, 255),
                    Color.rgb(32, 64, 76),
                    Color.rgb(65, 118, 136),
                    Color.rgb(170, 230, 240),
                    Color.rgb(88, 217, 154),
                    Color.rgb(103, 199, 255),
                    Color.rgb(208, 120, 255),
                    Color.rgb(249, 168, 212),
                    Color.rgb(185, 192, 202),
                    Color.rgb(99, 230, 160),
                    Color.rgb(248, 113, 113),
                    Color.rgb(103, 199, 255),
                    Color.rgb(23, 70, 53),
                    Color.rgb(23, 59, 94),
                    Color.rgb(59, 33, 94),
                    Color.rgb(88, 33, 63),
                    Color.rgb(32, 58, 64),
                    Color.rgb(20, 83, 45),
                    Color.rgb(90, 39, 39),
                    Color.rgb(23, 59, 94),
                    Color.rgb(48, 55, 70)
                );
            }
            return new Palette(
                Color.rgb(250, 251, 255),
                Color.rgb(242, 236, 255),
                Color.rgb(255, 255, 255),
                Color.rgb(255, 255, 255),
                Color.rgb(255, 255, 255),
                Color.rgb(248, 250, 255),
                Color.rgb(240, 236, 255),
                Color.rgb(31, 35, 51),
                Color.rgb(107, 114, 128),
                Color.rgb(229, 224, 245),
                Color.rgb(109, 93, 251),
                Color.rgb(178, 87, 246),
                Color.argb(28, 109, 93, 251),
                Color.argb(38, 109, 93, 251),
                Color.rgb(226, 247, 252),
                Color.rgb(181, 226, 235),
                Color.rgb(13, 103, 123),
                Color.rgb(50, 183, 123),
                Color.rgb(65, 168, 245),
                Color.rgb(168, 85, 247),
                Color.rgb(244, 114, 182),
                Color.rgb(123, 129, 144),
                Color.rgb(34, 197, 94),
                Color.rgb(239, 68, 68),
                Color.rgb(65, 168, 245),
                Color.rgb(221, 248, 233),
                Color.rgb(220, 238, 255),
                Color.rgb(238, 219, 255),
                Color.rgb(255, 224, 240),
                Color.rgb(238, 241, 246),
                Color.rgb(220, 252, 231),
                Color.rgb(254, 226, 226),
                Color.rgb(220, 238, 255),
                Color.rgb(241, 245, 249)
            );
        }
    }

    private enum ButtonTone {
        PRIMARY,
        SECONDARY
    }
}
