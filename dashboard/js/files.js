(function() {
    function refresh() {
        var $tmpl = $('#files li.component-template');
        dpd(Context.resourceId).get({action: 'list'}).then(function(files) {
            var $fileRows = [];
            files.forEach(function(file) {
                if(file.name[file.name.length-1] === '/' && file.size === 0) return;

                var $fileRow = $tmpl.clone().show();
                $fileRow.find('a.file-link').attr({
                    href: '/' + Context.resourceId + '/' + file.name
                }).text(file.name);
                $fileRow.find('a.file-delete').click(function() {
                    $.get('/' + Context.resourceId + '/' + file.name + '?_method=DELETE').then(function() {
                        setTimeout(function() {
                            alert('File was deleted!');
                        }, 100);
                    }, function(err) {
                        console.log(arguments);
                        alert('An error happened when deleting this file!');
                    }).always(refresh);
                });
                $fileRows.push($fileRow);
            });

            var $list = $('#files ul.component-list');
            $list.html('').append($tmpl.get(0));
            $($fileRows.map(function(value) { return value.get(0); })).appendTo($list);
        });
    }

    refresh();
})();