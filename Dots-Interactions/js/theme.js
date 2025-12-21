export function createThemeController({ darkToggleEl }) {
  const theme = {
    isDark: false,
    glClear: [1,1,1,1],
    gridStroke: "rgba(0,0,0,.08)",
    linkStroke: "rgba(0,0,0,.55)",
    markerStroke: "#000",
    markerFill: "#fff",
    text: "rgba(0,0,0,.85)",
  };

  function apply(isDark){
    theme.isDark = !!isDark;
    document.documentElement.dataset.theme = isDark ? "dark" : "light";

    if(isDark){
      theme.glClear = [0.06, 0.06, 0.09, 1];
      theme.gridStroke = "rgba(241,241,245,.10)";
      theme.linkStroke = "rgba(241,241,245,.55)";
      theme.markerStroke = "rgba(241,241,245,.90)";
      theme.markerFill = "rgba(15,15,22,.95)";
      theme.text = "rgba(241,241,245,.92)";
    }else{
      theme.glClear = [1, 1, 1, 1];
      theme.gridStroke = "rgba(0,0,0,.08)";
      theme.linkStroke = "rgba(0,0,0,.55)";
      theme.markerStroke = "#000";
      theme.markerFill = "#fff";
      theme.text = "rgba(0,0,0,.85)";
    }

    if(darkToggleEl) darkToggleEl.checked = isDark;
    try{ localStorage.setItem("relatorTheme", isDark ? "dark" : "light"); }catch(_){}
  }

  function init(){
    let saved = null;
    try{ saved = localStorage.getItem("relatorTheme"); }catch(_){}
    if(saved === "dark") apply(true);
    else if(saved === "light") apply(false);
    else{
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      apply(prefersDark);
    }

    if(darkToggleEl){
      darkToggleEl.addEventListener("change", (e)=>apply(e.target.checked));
    }
  }

  return { theme, init, apply };
}
