(function() {
    var $tmpl = $('#files li.component-template');
    dpd('f').get({action: 'list'}).then(function(files) {
        var $fileRows = [];
        files.forEach(function(file) {
            var $fileRow = $tmpl.clone();
            $fileRow.show().find('a.file-link').attr({
                href: '/' + Context.resourceId + '/' + file.name,
                target: '_blank'
            }).text(file.name);

            $fileRows.push($fileRow);
        });

        $($fileRows.map(function(value) { return value.get(0) })).appendTo('#files ul.component-list');
    });
})();